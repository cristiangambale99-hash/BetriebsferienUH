// Vorübergehende Diagnose: Kundenchat-Zuordnung prüfen (nur mit Admin-Code)
const B = require('./_beekeeper');
module.exports = async (req, res) => {
  const q = new URL(req.url, 'http://x').searchParams;
  if (q.get('code') !== process.env.ADMIN_PASSWORD) { res.statusCode = 401; return res.end('nein'); }
  if (q.get('raw')) {
    const base = String(process.env.BEEKEEPER_URL).replace(/\/+$/, ''), out = [];
    for (const p of q.get('raw').split('|')) { const r = await fetch(base + p, { headers: { Authorization: 'Token ' + process.env.BEEKEEPER_TOKEN, Accept: 'application/json, application/vnd.io.beekeeper.chats+json;version=1' } }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
      out.push({ p, status: r.status, keys: j && Object.keys(j), n: j && j.chats && j.chats.length, first: j && j.chats && j.chats[0] && j.chats[0].title, last: j && j.chats && j.chats.length && [j.chats[j.chats.length - 1].title, j.chats[j.chats.length - 1].updated_at, j.chats[j.chats.length - 1].id], extra: j && Object.fromEntries(Object.entries(j).filter(([k]) => k !== 'chats')), link: r.headers.get('link') }); }
    res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(out, null, 1));
  }
  const list = await B.chats();
  const tests = JSON.parse(q.get('t') || '[]').map(([kunde, objekt]) => { const m = B.match(list, { kunde, objekt }); return [kunde, objekt, m ? m.title : null]; });
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ chats: list.length, sample: list.slice(0, 400).map(c => c.title), tests }, null, 1));
};
