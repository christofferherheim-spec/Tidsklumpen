// GET /api/oversikt?n=NOKKEL
// Enkel oversikt over hvem som er påmeldt. Krever miljøvariabelen OVERSIKT_NOKKEL i Vercel.
const crypto = require('crypto');
const { EPISODER, db, somObjekt, nokkel, esc } = require('./_lib/felles');

function likt(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function dato(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '–';
  return new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
}
function ark(kropp) {
  return '<!doctype html><html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>Påmeldte · Tidsklumpen</title>'
    + '<style>body{margin:0;background:#D9C59C;color:#2A1F33;font:16px/1.4 Trebuchet MS,Verdana,sans-serif;padding:20px 12px}main{max-width:760px;margin:0 auto}'
    + 'h1{font-size:26px;margin:0 0 12px}.tall{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}.tall div{background:#FBF4E2;border:3px solid #2A1F33;border-radius:12px;padding:10px 12px}'
    + '.tall b{display:block;font-size:26px}.kort{background:#FBF4E2;border:3px solid #2A1F33;border-radius:12px;padding:12px 14px;margin-bottom:10px}.kort .e{font-weight:bold;word-break:break-all}'
    + '.kort .m{font-size:14px;margin-top:4px}.ja{color:#2A6B4A;font-weight:bold}.nei{color:#9A3B2E;font-weight:bold}p.l{font-size:14px}</style></head><body><main>' + kropp + '</main></body></html>';
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const hemmelig = process.env.OVERSIKT_NOKKEL;
  const n = String((req.query && req.query.n) || '');
  if (!hemmelig || hemmelig.length < 12 || !likt(n, hemmelig)) return res.status(404).send(ark('<h1>Fant ikke siden</h1>'));
  try {
    const [tokens] = await db([['SMEMBERS', nokkel.alle]]);
    const liste = tokens || [], rader = [];
    for (let i = 0; i < liste.length; i += 200) {
      const bit = liste.slice(i, i + 200);
      const svar = await db(bit.map((t) => ['HGETALL', nokkel.sub(t)]));
      svar.forEach((s) => { const o = somObjekt(s); if (o && o.epost) rader.push(o); });
    }
    rader.sort((a, b) => String(b.start).localeCompare(String(a.start)));
    const bekreftet = rader.filter((r) => r.bekreftet === '1').length;
    const snitt = rader.length ? (rader.reduce((s, r) => s + (Number(r.opp) || 1), 0) / rader.length).toFixed(1).replace('.', ',') : '0';
    const kort = rader.map((r) => '<div class="kort"><div class="e">' + esc(r.epost) + '</div><div class="m">'
      + 'Påmeldt ' + esc(dato(r.start)) + ' · ' + (r.bekreftet === '1' ? '<span class="ja">Bekreftet</span>' : '<span class="nei">Ikke åpnet lenka</span>')
      + ' · Reise ' + esc(Math.min(Number(r.opp) || 1, EPISODER.length)) + ' av ' + EPISODER.length + ' låst opp'
      + (r.sist ? ' · Sist sendt ' + esc(r.sist) : '') + '</div></div>').join('');
    return res.status(200).send(ark('<h1>Påmeldte</h1><div class="tall"><div><b>' + rader.length + '</b>påmeldt</div><div><b>' + bekreftet + '</b>bekreftet</div><div><b>' + snitt
      + '</b>reiser i snitt</div></div>' + (kort || '<p>Ingen påmeldte ennå.</p>') + '<p class="l">Del ikke denne lenka. Den viser e-postadressene.</p>'));
  } catch (x) {
    console.error('oversikt', x.message);
    return res.status(500).send(ark('<h1>Noe gikk galt</h1><p>Prøv igjen om litt.</p>'));
  }
};
