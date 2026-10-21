const L = require('./_lib');

module.exports = async (req, res) => {
  if (!L.isAdmin(req)) return L.json(res, 401, { error: 'Code falsch' });
  try {
    const q = new URL(req.url, 'http://x').searchParams;
    const action = q.get('action');
    const body = req.method === 'POST' ? await L.readBody(req) : {};
    const by = req.headers['x-admin-user'] || 'Admin';

    if (action === 'bootstrap') {
      try { await require('./_verkauf').syncVerkauf({ force: q.get('sync') === '1' }); } catch (e) { console.error('sync verkauf', e.message); }
      const d = await L.admin('bootstrap');
      if (!d.settings.body) d.settings.body = L.DEFAULT_BODY;
      d.base_url = L.BASE_URL;
      return L.json(res, 200, d);
    }
    if (action === 'settings') return L.json(res, 200, await L.admin('settings_set', body));
    if (action === 'import') {
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 2000) : [];
      if (!rows.length) return L.json(res, 400, { error: 'Keine Zeilen' });
      return L.json(res, 200, await L.admin('import', { rows, by }));
    }
    if (action === 'cust_add') return L.json(res, 200, await L.adminCust('add', { ...body, by }));
    if (action === 'cust_update') return L.json(res, 200, await L.adminCust('update', { ...body, by }));
    if (action === 'cust_delete') return L.json(res, 200, await L.adminCust('delete', { id: body.id, by }));
    if (action === 'done') return L.json(res, 200, await L.admin('done', { id: body.id, done: !!body.done, by }));
    if (action === 'manual') return L.json(res, 200, await L.admin('manual_response', { ...body, by }));
    if (action === 'preview') {
      // Mail-Vorschau mit den aktuellen (ungespeicherten) Einstellungen
      const d = await L.admin('bootstrap');
      const s = { ...d.settings, ...(body.settings || {}) }; if (!s.body) s.body = L.DEFAULT_BODY;
      const c = d.customers.find(x => x.id === body.id) || d.customers[0] || { kunde: 'Muster AG', objekt: 'Bahnhofstrasse 1, Effretikon', ansprechperson: 'Frau Muster', email: 'muster@example.ch', token: 'beispiel' };
      res.statusCode = 200; res.setHeader('content-type', 'text/html; charset=utf-8'); res.setHeader('cache-control', 'no-store');
      return res.end(L.mailHtml(c, s, { reminder: !!body.reminder }));
    }
    return L.json(res, 400, { error: 'Unbekannte Aktion' });
  } catch (e) {
    return L.json(res, 500, { error: e.message });
  }
};
