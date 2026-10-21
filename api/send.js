// Versand: Anfrage, Erinnerung, Testmail. Einzelversand (Logo als Inline-Bild geht nur so), in Etappen à ~45 s.
// Der Browser ruft so lange nach, bis «more» false ist; «run_started» verhindert Doppelversand innerhalb eines Laufs.
const L = require('./_lib');

module.exports = async (req, res) => {
  if (!L.isAdmin(req)) return L.json(res, 401, { error: 'Code falsch' });
  if (req.method !== 'POST') return L.json(res, 405, { error: 'POST' });
  try {
    const body = await L.readBody(req);
    const by = req.headers['x-admin-user'] || 'Admin';
    if (!body.test && !body.continued) { try { await require('./_verkauf').syncVerkauf({ force: true }); } catch (e) { console.error('sync verkauf', e.message); } }
    const d = await L.admin('bootstrap');
    const s = { ...d.settings, ...(body.settings || {}) }; if (!s.body) s.body = L.DEFAULT_BODY;
    const from = `${s.sender_name || 'Clean Service Scaramuzzo AG · Unterhaltsreinigung'} <noreply@clean-service.ch>`; // Absender fix: noreply@clean-service.ch
    const kind = body.kind === 'erinnerung' ? 'erinnerung' : 'anfrage';
    const reminder = kind === 'erinnerung';

    if (body.test) {
      const c = d.customers[0] || { kunde: 'Muster AG', objekt: 'Bahnhofstrasse 1, Effretikon', ansprechperson: 'Frau Muster', email: body.test, token: 'beispiel' };
      const r = await L.resendSend({ from, to: [body.test], reply_to: s.reply_to, subject: '[TEST] ' + L.fill(s.subject, c, s), html: L.mailHtml(c, s, { reminder, inline: true }), text: L.mailText(c, s, { reminder }), attachments: [L.logoAttachment()] });
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
    // Bereits in diesem Lauf versendete überspringen (Etappenversand)
    const run = body.run_started ? new Date(body.run_started).getTime() : 0;
    if (run) list = list.filter(c => { const t = reminder ? c.reminded_at : c.sent_at; return !(t && new Date(t).getTime() >= run - 1000); });
    if (Array.isArray(body.exclude) && body.exclude.length) { const ex = new Set(body.exclude); list = list.filter(c => !ex.has(c.id)); }
    if (!list.length) return L.json(res, run ? 200 : 400, run ? { ok: true, sent: 0, failed: 0, skipped: 0, more: false } : { error: 'Keine Empfänger für diese Auswahl' });

    const noMail = d.customers.filter(c => !c.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)).map(c => ({ id: c.id, status: 'err', error: 'Keine gültige E-Mail-Adresse', kind }));
    if (noMail.length && sel !== 'offen' && !body.continued) await L.admin('mark_sent', { items: noMail, by });

    const t0 = Date.now(), logo = L.logoAttachment(), results = [];
    let i = 0;
    for (; i < list.length && Date.now() - t0 < 45000; i++) {
      const c = list[i];
      const mail = { from, to: [c.email], reply_to: s.reply_to, subject: L.fill(s.subject, c, s), html: L.mailHtml(c, s, { reminder, inline: true }), text: L.mailText(c, s, { reminder }), attachments: [logo], tags: [{ name: 'tool', value: 'betriebsferien-uh' }, { name: 'kind', value: kind }] };
      const t = Date.now();
      try { await L.resendSend(mail); results.push({ id: c.id, status: 'ok', kind }); }
      catch (e) {
        if (/rate|429|too many/i.test(e.message)) { await new Promise(r => setTimeout(r, 1200)); try { await L.resendSend(mail); results.push({ id: c.id, status: 'ok', kind }); } catch (e2) { results.push({ id: c.id, status: 'err', error: e2.message, kind }); } }
        else results.push({ id: c.id, status: 'err', error: e.message, kind });
      }
      const wait = 520 - (Date.now() - t); if (wait > 0) await new Promise(r => setTimeout(r, wait)); // Resend-Limit 2/s
    }
    if (results.length) await L.admin('mark_sent', { items: results, by });
    const ok = results.filter(r => r.status === 'ok').length;
    return L.json(res, 200, { ok: true, sent: ok, failed: results.length - ok, skipped: body.continued ? 0 : noMail.length, more: i < list.length, remaining: list.length - i, failed_ids: results.filter(r => r.status !== 'ok').map(r => r.id) });
  } catch (e) {
    return L.json(res, 500, { error: e.message });
  }
};
