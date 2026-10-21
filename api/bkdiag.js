// Vorübergehende Diagnose: welche Beekeeper-Chats sieht der UH-Bot? (nur mit Admin-Code)
module.exports = async (req, res) => {
  const q = new URL(req.url, 'http://x').searchParams;
  if (q.get('code') !== process.env.ADMIN_PASSWORD) { res.statusCode = 401; return res.end('nein'); }
  const base = String(process.env.BEEKEEPER_URL || '').replace(/\/+$/, '');
  const H = a => ({ Authorization: 'Token ' + process.env.BEEKEEPER_TOKEN, Accept: a });
  const paths = (q.get('p') || '/api/2/chats/groups?limit=20|/api/2/chats?limit=20|/api/2/conversations?limit=20|/api/2/users/me').split('|');
  const out = [];
  for (const p of paths) {
    for (const acc of ['application/json, application/vnd.io.beekeeper.chats+json;version=1']) {
      try { const r = await fetch(base + p, { headers: H(acc) }); const t = await r.text(); out.push({ p, status: r.status, body: t.slice(0, 2500) }); }
      catch (e) { out.push({ p, err: e.message }); }
    }
  }
  res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(out, null, 1));
};
