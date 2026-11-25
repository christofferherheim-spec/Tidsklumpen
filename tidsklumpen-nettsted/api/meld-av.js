// GET  /api/meld-av?t=TOKEN  -> en liten side med én knapp (så e-postskannere ikke melder noen av ved et uhell)
// POST /api/meld-av?t=TOKEN  -> sletter adressen
const { db, somObjekt, nokkel, gyldigToken, esc } = require('./_lib/felles');

function ark(tittel, kropp) {
  return '<!doctype html><html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + tittel + '</title></head>'
    + '<body style="margin:0;background:#D9C59C;padding:32px 14px;font-family:Trebuchet MS,Verdana,sans-serif;color:#2A1F33">'
    + '<div style="max-width:460px;margin:0 auto;background:#FBF4E2;border:3px solid #2A1F33;border-radius:12px;padding:22px 20px"><h1 style="margin:0 0 12px;font-size:26px">' + tittel + '</h1>' + kropp
    + '<p style="margin:18px 0 0"><a href="/" style="color:#2A1F33">Til tidsklumpen.no</a></p></div></body></html>';
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const t = String((req.query && req.query.t) || '');
  if (!gyldigToken(t)) return res.status(404).send(ark('Fant ikke lenka', '<p>Lenka er ikke gyldig. Kanskje du allerede er meldt av.</p>'));
  try {
    if (req.method === 'POST') {
      const [flat] = await db([['HGETALL', nokkel.sub(t)]]);
      const sub = somObjekt(flat);
      if (sub) await db([['DEL', nokkel.sub(t)], ['DEL', nokkel.epost(sub.epost)], ['SREM', nokkel.alle, t]]);
      return res.status(200).send(ark('Du er meldt av', '<p>Adressen er slettet, og det kommer ikke flere e-poster. Det som ligger på hylla i nettleseren din, blir liggende.</p><p>«Notert», sier Knut.</p>'));
    }
    return res.status(200).send(ark('Melde deg av?', '<p>Da kommer det ikke flere reiser på e-post, og adressen slettes.</p>'
      + '<form method="post" action="/api/meld-av?t=' + esc(t) + '"><button type="submit" style="background:#F2C94C;color:#2A1F33;border:3px solid #2A1F33;border-radius:12px;padding:11px 18px;font-size:18px;font-weight:bold;cursor:pointer">Ja, meld meg av</button></form>'));
  } catch (x) {
    console.error('meld-av', x.message);
    return res.status(500).send(ark('Noe gikk galt', '<p>Prøv igjen om litt.</p>'));
  }
};
