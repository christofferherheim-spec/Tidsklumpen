// POST /api/meld-paa  { epost }
// Lagrer adressen og sender første reise med en gang. Adressen regnes som bekreftet først når lenka i e-posten er åpnet.
const { db, somObjekt, nokkel, nyttToken, side, send } = require('./_lib/felles');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ feil: 'Bruk POST.' });
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (x) { b = {}; } }
  b = b || {};
  if (b.nettside) return res.status(200).json({ ok: true }); // skjult felt som bare roboter fyller ut
  const adr = String(b.epost || '').trim().toLowerCase();
  if (adr.length > 200 || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(adr)) return res.status(400).json({ feil: 'Det ser ikke ut som en e-postadresse.' });

  try {
    const ip = String(req.headers['x-forwarded-for'] || 'ukjent').split(',')[0].trim();
    const rl = 'tk:rl:' + ip + ':' + new Date().toISOString().slice(0, 13);
    const [antall] = await db([['INCR', rl], ['EXPIRE', rl, 3600]]);
    if (antall > 10) return res.status(429).json({ feil: 'Litt for mange forsøk. Prøv igjen om en time.' });

    const base = side(req), naa = Date.now();
    const [finnes] = await db([['GET', nokkel.epost(adr)]]);
    if (finnes) {
      const [flat] = await db([['HGETALL', nokkel.sub(finnes)]]);
      const sub = somObjekt(flat);
      if (sub) {
        // Allerede påmeldt: send lenka på nytt, men ikke oftere enn hvert tiende minutt.
        if (naa - Number(sub.lenke || 0) > 10 * 60 * 1000) {
          await send(adr, Math.max(1, Number(sub.opp) || 1), base, finnes, true);
          await db([['HSET', nokkel.sub(finnes), 'lenke', String(naa)]]);
        }
        return res.status(200).json({ ok: true });
      }
    }
    const token = nyttToken();
    await db([
      ['HSET', nokkel.sub(token), 'epost', adr, 'opp', '1', 'start', new Date(naa).toISOString(), 'sist', '', 'bekreftet', '0', 'side', base, 'lenke', String(naa)],
      ['SET', nokkel.epost(adr), token],
      ['SADD', nokkel.alle, token],
    ]);
    try { await send(adr, 1, base, token, true); }
    catch (x) {
      await db([['DEL', nokkel.sub(token)], ['DEL', nokkel.epost(adr)], ['SREM', nokkel.alle, token]]);
      console.error('meld-paa: sending feilet', x.message);
      return res.status(502).json({ feil: 'Vi fikk ikke sendt e-posten. Prøv igjen om litt.' });
    }
    return res.status(200).json({ ok: true });
  } catch (x) {
    console.error('meld-paa', x.message);
    return res.status(500).json({ feil: 'Noe gikk galt. Prøv igjen om litt.' });
  }
};
