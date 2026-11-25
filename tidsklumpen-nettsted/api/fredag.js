// GET /api/fredag  (kjøres av Vercel hver fredag, se vercel.json)
// Låser opp neste reise for alle som har bekreftet adressen, og sender e-posten.
const { EPISODER, db, somObjekt, nokkel, iDagOslo, send } = require('./_lib/felles');

const PAUSE_MS = Number(process.env.SEND_PAUSE_MS || 550); // holder oss under Resends grense per sekund
const BUDSJETT_MS = 240000;                                 // stopp i god tid før funksjonen blir avbrutt

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const hemmelig = process.env.CRON_SECRET;
  if (!hemmelig || req.headers.authorization !== 'Bearer ' + hemmelig) return res.status(401).json({ feil: 'Ikke tillatt.' });
  const startet = Date.now(), dag = iDagOslo(), r = { dag, sendt: 0, hoppet_over: 0, feilet: 0, gjenstaar: 0 };
  try {
    const [tokens] = await db([['SMEMBERS', nokkel.alle]]);
    const liste = tokens || [];
    for (let i = 0; i < liste.length; i += 200) {
      const bit = liste.slice(i, i + 200);
      const rader = await db(bit.map((t) => ['HGETALL', nokkel.sub(t)]));
      for (let k = 0; k < bit.length; k++) {
        const t = bit[k], sub = somObjekt(rader[k]);
        if (!sub) { await db([['SREM', nokkel.alle, t]]); continue; }
        const opp = Number(sub.opp) || 1;
        const forNy = Date.now() - Date.parse(sub.start || 0) < 24 * 3600 * 1000;
        if (sub.bekreftet !== '1' || opp >= EPISODER.length || sub.sist === dag || forNy) { r.hoppet_over++; continue; }
        if (Date.now() - startet > BUDSJETT_MS) { r.gjenstaar++; continue; }
        try {
          await send(sub.epost, opp + 1, process.env.SIDE_URL || sub.side || 'https://tidsklumpen.no', t, false);
          await db([['HSET', nokkel.sub(t), 'opp', String(opp + 1), 'sist', dag]]);
          r.sendt++;
        } catch (x) { r.feilet++; console.error('fredag: sending feilet', x.message); }
        if (PAUSE_MS) await new Promise((f) => setTimeout(f, PAUSE_MS));
      }
    }
    console.log('fredag', JSON.stringify(r));
    return res.status(200).json(r);
  } catch (x) {
    console.error('fredag', x.message);
    return res.status(500).json({ feil: x.message });
  }
};
