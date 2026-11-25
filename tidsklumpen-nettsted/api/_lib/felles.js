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
function epost(n, base, token, forste) {
  const e = EPISODER[n - 1];
  const lenke = base + '/?t=' + token + '#ep' + n;
  const av = base + '/api/meld-av?t=' + token;
  const emne = (forste ? 'Første reise: ' : 'Reise ' + n + ': ') + e.tittel;
  const hilsen = forste
    ? 'Knut her. Jeg er rotte, jeg veier 400 gram, og det er jeg som fører loggboka. Du er påmeldt. Første reise ligger klar.'
    : 'Knut her. Det er fredag, og Ludvig har teipet maskinen sammen igjen.';
  const linjer = [
    hilsen,
    'Ludvig stilte inn på tirsdag 14. oktober klokka 16.40. Bommen denne gangen: ' + e.bom + '.',
    'Dere landet her: ' + e.naar + '.',
    'Oppdraget: ' + e.oppdrag,
  ];
  const etter = 'Tingen kommer ikke på hylla før du har svart riktig på tre spørsmål. Jeg har laget dem selv.';
  const neste = n < EPISODER.length ? 'Neste reise kommer på fredag.' : 'Det var den siste reisen som er ferdig. Ludvig tegner flere, og de kommer på e-post når de er klare.';
  const bunn = 'Du får denne e-posten fordi adressen ble meldt på tidsklumpen.no.';
  const tekst = linjer.join('\n\n') + '\n\nLes reise ' + n + ' her:\n' + lenke + '\n\n' + etter + '\n\nHilsen Knut\n\n' + neste + '\n' + bunn + '\nMeld deg av: ' + av + '\n';
  const html = '<!doctype html><html lang="nb"><body style="margin:0;background:#D9C59C;padding:24px 12px;font-family:Trebuchet MS,Verdana,sans-serif;color:#2A1F33">'
    + '<div style="max-width:520px;margin:0 auto;background:#FBF4E2;border:3px solid #2A1F33;border-radius:12px;padding:22px 20px">'
    + '<p style="margin:0 0 4px;font-size:14px;font-weight:bold;letter-spacing:.04em;text-transform:uppercase">Ludvig og Tidsklumpen · reise ' + n + ' av 52</p>'
    + '<h1 style="margin:0 0 14px;font-size:28px;line-height:1.1">' + esc(e.tittel) + '</h1>'
    + linjer.map((l) => '<p style="margin:0 0 12px;font-size:17px;line-height:1.4">' + esc(l) + '</p>').join('')
    + '<p style="margin:20px 0"><a href="' + esc(lenke) + '" style="display:inline-block;background:#F2C94C;color:#2A1F33;border:3px solid #2A1F33;border-radius:12px;padding:12px 20px;font-size:19px;font-weight:bold;text-decoration:none">Les reise ' + n + '</a></p>'
    + '<p style="margin:0 0 12px;font-size:17px;line-height:1.4">' + esc(etter) + '</p>'
    + '<p style="margin:0;font-size:17px;line-height:1.4">Hilsen Knut</p>'
    + '</div><p style="max-width:520px;margin:14px auto 0;font-size:13px;line-height:1.45;color:#2A1F33">' + esc(neste) + ' ' + esc(bunn)
    + ' <a href="' + esc(av) + '" style="color:#2A1F33">Meld deg av</a>.</p></body></html>';
  return { emne, tekst, html, av };
}

async function send(til, n, base, token, forste) {
  if (!process.env.RESEND_API_KEY) throw new Error('Mangler RESEND_API_KEY.');
  const m = epost(n, base, token, forste);
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
