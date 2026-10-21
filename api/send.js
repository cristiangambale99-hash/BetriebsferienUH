// Versand: Anfrage, Erinnerung, Testmail. Resend-Batch (max. 100 pro Aufruf), danach Status in DB.
const L = require('./_lib');

module.exports = async (req, res) => {
  if (!L.isAdmin(req)) return L.json(res, 401, { error: 'Passwort falsch' });
  if (req.method !== 'POST') return L.json(res, 405, { error: 'POST' });
  try {
    const body = await L.readBody(req);
    const by = req.headers['x-admin-user'] || 'Admin';
    const d = await L.admin('bootstrap');
    const s = { ...d.settings, ...(body.settings || {}) }; if (!s.body) s.body = L.DEFAULT_BODY;
    const from = `${s.sender_name || 'Clean Service Scaramuzzo AG · Unterhaltsreinigung'} <noreply@clean-service.ch>`; // Absender fix: noreply@clean-service.ch
    const kind = body.kind === 'erinnerung' ? 'erinnerung' : 'anfrage';
    const reminder = kind === 'erinnerung';

    if (body.test) {
      const c = d.customers[0] || { kunde: 'Muster AG', objekt: 'Bahnhofstrasse 1, Effretikon', ansprechperson: 'Frau Muster', email: body.test, token: 'beispiel' };
      const r = await L.resendSend({ from, to: [body.test], reply_to: s.reply_to, subject: '[TEST] ' + L.fill(s.subject, c, s), html: L.mailHtml(c, s, { reminder }), text: L.mailText(c, s, { reminder }) });
      return L.json(res, 200, { ok: true, id: r.id });
    }

    // Empfänger bestimmen
    let list = d.customers.filter(c => c.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email));
    const sel = body.recipients || 'alle';
    if (Array.isArray(body.ids)) list = list.filter(c => body.ids.includes(c.id));
    else if (sel === 'offen') list = list.filter(c => !c.response && c.send_status !== 'neu');       // angeschrieben, ohne Rückmeldung
    else if (sel === 'neu') list = list.filter(c => c.send_status === 'neu');                          // noch nie angeschrieben
    else if (sel === 'fehler') list = list.filter(c => c.send_status === 'fehler');
    if (reminder) list = list.filter(c => !c.response);
    if (!list.length) return L.json(res, 400, { error: 'Keine Empfänger für diese Auswahl' });

    const noMail = d.customers.filter(c => !c.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)).map(c => ({ id: c.id, status: 'err', error: 'Keine gültige E-Mail-Adresse', kind }));
    if (noMail.length && sel !== 'offen') await L.admin('mark_sent', { items: noMail, by });

    const results = [];
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100);
      const items = chunk.map(c => ({ from, to: [c.email], reply_to: s.reply_to, subject: L.fill(s.subject, c, s), html: L.mailHtml(c, s, { reminder }), text: L.mailText(c, s, { reminder }), tags: [{ name: 'tool', value: 'betriebsferien-uh' }, { name: 'kind', value: kind }] }));
      try {
        await L.resendBatch(items);
        chunk.forEach(c => results.push({ id: c.id, status: 'ok', kind }));
      } catch (e) {
        // Batch abgelehnt: einzeln versuchen, damit der Fehler pro Kunde sichtbar wird
        for (const [k, c] of chunk.entries()) {
          try { await L.resendSend(items[k]); results.push({ id: c.id, status: 'ok', kind }); }
          catch (e2) { results.push({ id: c.id, status: 'err', error: e2.message, kind }); }
          await new Promise(r => setTimeout(r, 550)); // Resend-Limit 2/s
        }
      }
      if (i + 100 < list.length) await new Promise(r => setTimeout(r, 600));
    }
    await L.admin('mark_sent', { items: results, by });
    const ok = results.filter(r => r.status === 'ok').length;
    return L.json(res, 200, { ok: true, sent: ok, failed: results.length - ok, skipped: noMail.length });
  } catch (e) {
    return L.json(res, 500, { error: e.message });
  }
};
