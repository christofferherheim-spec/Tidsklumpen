// GET /api/status?t=TOKEN  ->  { opp, antall }
// Siden spør her om hvor mange reiser som er låst opp. Første oppslag bekrefter også adressen.
const { EPISODER, db, somObjekt, nokkel, gyldigToken } = require('./_lib/felles');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const t = String((req.query && req.query.t) || '');
  if (!gyldigToken(t)) return res.status(404).json({ feil: 'Ukjent lenke.' });
  try {
    const [flat] = await db([['HGETALL', nokkel.sub(t)]]);
    const sub = somObjekt(flat);
    if (!sub) return res.status(404).json({ feil: 'Ukjent lenke.' });
    if (sub.bekreftet !== '1') await db([['HSET', nokkel.sub(t), 'bekreftet', '1']]);
    return res.status(200).json({ opp: Math.min(EPISODER.length, Math.max(1, Number(sub.opp) || 1)), antall: EPISODER.length });
  } catch (x) {
    console.error('status', x.message);
    return res.status(500).json({ feil: 'Noe gikk galt.' });
  }
};
