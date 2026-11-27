// Felles for alle funksjonene: database (Upstash Redis over REST), e-post (Resend) og e-postmalen.
// Ingen pakker å installere. Alt går med innebygd fetch.
const crypto = require('crypto');
const EPISODER = require('./episoder.json');

const DB_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const DB_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const FRA = process.env.EPOST_FRA || 'Tidsklumpen <onboarding@resend.dev>';

async function db(kommandoer) {
  if (!DB_URL || !DB_TOKEN) throw new Error('Databasen er ikke koblet til (mangler KV_REST_API_URL / KV_REST_API_TOKEN).');
  const r = await fetch(DB_URL.replace(/\/$/, '') + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + DB_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(kommandoer),
  });
  if (!r.ok) throw new Error('Databasefeil ' + r.status);
  const svar = await r.json();
  return svar.map((s) => { if (s.error) throw new Error(s.error); return s.result; });
}

function somObjekt(flat) {
  if (!flat) return null;
  if (!Array.isArray(flat)) return Object.keys(flat).length ? flat : null;
  if (!flat.length) return null;
  const o = {};
  for (let i = 0; i < flat.length; i += 2) o[flat[i]] = flat[i + 1];
  return o;
}

const nokkel = {
  sub: (t) => 'tk:sub:' + t,
  epost: (e) => 'tk:epost:' + crypto.createHash('sha256').update(e).digest('hex'),
  alle: 'tk:subs',
};

function gyldigToken(t) { return typeof t === 'string' && /^[a-f0-9]{32}$/.test(t); }
function nyttToken() { return crypto.randomBytes(16).toString('hex'); }

function side(req) {
  const vert = String((req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '').toLowerCase();
  if (/^([a-z0-9-]+\.)*tidsklumpen\.no$/.test(vert) || /^[a-z0-9-]+\.vercel\.app$/.test(vert)) return 'https://' + vert;
  return process.env.SIDE_URL || 'https://tidsklumpen.no';
}

function iDagOslo(d) { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(d || new Date(Date.now())); }

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// E-posten for episode n. forste = true for den som kommer rett etter påmelding.
const TEKST = {
  nb: {
    lang: 'nb', forste: (n) => 'Du er med! Reise ' + n + ': ', reise: (n) => 'Reise ' + n + ': ',
    hilsenForste: (n) => 'Knut her. Jeg er rotte, jeg veier 400 gram, og det er jeg som fører loggboka. Du er påmeldt. Reise 1 kan alle lese på tidsklumpen.no. Her kommer reise ' + n + '.',
    hilsen: 'Knut her. Det er fredag, og Ludvig har teipet maskinen sammen igjen.',
    bom: (b) => 'Ludvig stilte inn på tirsdag 14. oktober klokka 16.40. Bommen denne gangen: ' + b + '.',
    landet: (s) => 'Dere landet her: ' + s + '.', oppdrag: 'Oppdraget: ',
    etter: 'Tingen kommer ikke på hylla før du har svart riktig på tre spørsmål. Jeg har laget dem selv.',
    neste: 'Neste reise kommer på fredag.', siste: 'Det var den siste reisen som er ferdig. Ludvig tegner flere, og de kommer på e-post når de er klare.',
    bunn: 'Du får denne e-posten fordi adressen ble meldt på tidsklumpen.no.', les: (n) => 'Les reise ' + n, her: ' her:',
    hilsenKnut: 'Hilsen Knut', av: 'Meld deg av', topp: (n) => 'Ludvig og Tidsklumpen · reise ' + n + ' av 52',
  },
  en: {
    lang: 'en', forste: (n) => 'You are in! Journey ' + n + ': ', reise: (n) => 'Journey ' + n + ': ',
    hilsenForste: (n) => 'Knut here. I am a rat, I weigh 400 grams, and I am the one who keeps the logbook. You are signed up. Anyone can read journey 1 at tidsklumpen.no. Here is journey ' + n + '.',
    hilsen: 'Knut here. It is Friday, and Ludvig has taped the machine back together.',
    bom: (b) => 'Ludvig set the dial to Tuesday the 14th of October, twenty to five. This time he missed by ' + b + '.',
    landet: (s) => 'You landed here: ' + s + '.', oppdrag: 'The mission: ',
    etter: 'The thing does not go on the shelf until you have answered three questions correctly. I wrote them myself.',
    neste: 'The next journey comes on Friday.', siste: 'That was the last journey that is finished. Ludvig is drawing more, and they will arrive by e-mail when they are ready.',
    bunn: 'You are getting this e-mail because the address was signed up at tidsklumpen.no.', les: (n) => 'Read journey ' + n, her: ' here:',
    hilsenKnut: 'From Knut', av: 'Unsubscribe', topp: (n) => 'Ludvig and the Time Lump · journey ' + n + ' of 52',
  },
};

function epost(n, base, token, forste, sprak) {
  const T = TEKST[sprak === 'en' ? 'en' : 'nb'];
  const g = EPISODER[n - 1];
  const e = T.lang === 'en' && g.en ? Object.assign({}, g, g.en) : g;
  const lenke = base + '/?t=' + token + (T.lang === 'en' ? '&sprak=en' : '') + '#ep' + n;
  const av = base + '/api/meld-av?t=' + token;
  const emne = (forste ? T.forste(n) : T.reise(n)) + e.tittel;
  const linjer = [forste ? T.hilsenForste(n) : T.hilsen, T.bom(e.bom), T.landet(e.naar), T.oppdrag + e.oppdrag];
  const etter = T.etter;
  const neste = n < EPISODER.length ? T.neste : T.siste;
  const bunn = T.bunn;
  const tekst = linjer.join('\n\n') + '\n\n' + T.les(n) + T.her + '\n' + lenke + '\n\n' + etter + '\n\n' + T.hilsenKnut + '\n\n' + neste + '\n' + bunn + '\n' + T.av + ': ' + av + '\n';
  const html = '<!doctype html><html lang="' + T.lang + '"><body style="margin:0;background:#D9C59C;padding:24px 12px;font-family:Trebuchet MS,Verdana,sans-serif;color:#2A1F33">'
    + '<div style="max-width:520px;margin:0 auto;background:#FBF4E2;border:3px solid #2A1F33;border-radius:12px;padding:22px 20px">'
    + '<p style="margin:0 0 4px;font-size:14px;font-weight:bold;letter-spacing:.04em;text-transform:uppercase">' + esc(T.topp(n)) + '</p>'
    + '<h1 style="margin:0 0 14px;font-size:28px;line-height:1.1">' + esc(e.tittel) + '</h1>'
    + linjer.map((l) => '<p style="margin:0 0 12px;font-size:17px;line-height:1.4">' + esc(l) + '</p>').join('')
    + '<p style="margin:20px 0"><a href="' + esc(lenke) + '" style="display:inline-block;background:#F2C94C;color:#2A1F33;border:3px solid #2A1F33;border-radius:12px;padding:12px 20px;font-size:19px;font-weight:bold;text-decoration:none">' + esc(T.les(n)) + '</a></p>'
    + '<p style="margin:0 0 12px;font-size:17px;line-height:1.4">' + esc(etter) + '</p>'
    + '<p style="margin:0;font-size:17px;line-height:1.4">' + esc(T.hilsenKnut) + '</p>'
    + '</div><p style="max-width:520px;margin:14px auto 0;font-size:13px;line-height:1.45;color:#2A1F33">' + esc(neste) + ' ' + esc(bunn)
    + ' <a href="' + esc(av) + '" style="color:#2A1F33">' + esc(T.av) + '</a>.</p></body></html>';
  return { emne, tekst, html, av };
}

async function send(til, n, base, token, forste, sprak) {
  if (!process.env.RESEND_API_KEY) throw new Error('Mangler RESEND_API_KEY.');
  const m = epost(n, base, token, forste, sprak);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FRA, to: [til], subject: m.emne, html: m.html, text: m.tekst,
      headers: { 'List-Unsubscribe': '<' + m.av + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }),
  });
  if (!r.ok) { let d = ''; try { d = await r.text(); } catch (x) {} throw new Error('Resend svarte ' + r.status + ' ' + d.slice(0, 200)); }
  return true;
}

module.exports = { EPISODER, db, somObjekt, nokkel, gyldigToken, nyttToken, side, iDagOslo, epost, send, esc };
