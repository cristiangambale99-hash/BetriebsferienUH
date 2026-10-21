// Vorübergehende Diagnose: Kundenchat-Zuordnung prüfen (nur mit Admin-Code)
const B = require('./_beekeeper');
module.exports = async (req, res) => {
  const q = new URL(req.url, 'http://x').searchParams;
  if (q.get('code') !== process.env.ADMIN_PASSWORD) { res.statusCode = 401; return res.end('nein'); }
  const list = await B.chats();
  const tests = JSON.parse(q.get('t') || '[]').map(([kunde, objekt]) => { const m = B.match(list, { kunde, objekt }); return [kunde, objekt, m ? m.title : null]; });
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ chats: list.length, sample: list.slice(0, 400).map(c => c.title), tests }, null, 1));
};
