// Kundenseite: Daten zum Token laden und Rückmeldung speichern (+ Bestätigung an Kunde und Kopie an UH)
const L = require('./_lib');
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function weekLines(weeks) {
  return Object.keys(weeks || {}).sort((a, b) => +a - +b).map(kw => `KW ${kw}: ${+weeks[kw] === 0 ? 'kein Einsatz' : weeks[kw] + '× reduziert'}`);
}

module.exports = async (req, res) => {
  try {
    const q = new URL(req.url, 'http://x').searchParams;
    const token = (q.get('t') || '').trim();
    if (!/^[a-f0-9]{8,32}$/i.test(token)) return L.json(res, 404, { error: 'Dieser Link ist ungültig.' });

    if (req.method === 'GET') {
      try { return L.json(res, 200, await L.pub('get', { token })); }
      catch { return L.json(res, 404, { error: 'Dieser Link ist ungültig oder abgelaufen.' }); }
    }
    if (req.method !== 'POST') return L.json(res, 405, { error: 'POST' });

    const b = await L.readBody(req);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.von || '') || !/^\d{4}-\d{2}-\d{2}$/.test(b.bis || '')) return L.json(res, 400, { error: 'Bitte ersten und letzten Ferientag wählen.' });
    if (b.bis < b.von) return L.json(res, 400, { error: 'Das Ende liegt vor dem Anfang.' });
    const weeks = {}; for (const [k, v] of Object.entries(b.weeks || {})) if (/^\d{1,2}$/.test(k) && [0, 1, 2, 3].includes(+v)) weeks[k] = +v;
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const r = await L.pub('respond', { token, von: b.von, bis: b.bis, weeks, note: String(b.note || '').slice(0, 1000), ip });

    // Bestätigung an Kunde + Kopie an UH (Fehler hier dürfen die Meldung nicht blockieren)
    try {
      const d = await L.pub('get', { token });
      const s = { reply_to: process.env.REPLY_TO_FALLBACK || 'unterhaltsreinigung@clean-service.ch' };
      const lines = weekLines(weeks);
      const sum = `Betriebsferien ${L.fmtDate(b.von)} – ${L.fmtDate(b.bis)}` + (lines.length ? ' · ' + lines.join(' · ') : '');
      const note = String(b.note || '').trim();
      const P = t => `<p style="margin:0 0 12px;font-family:Verdana,Geneva,sans-serif;font-size:14px;line-height:1.6;color:#3c3c3b">${t}</p>`;
      const html = `<!doctype html><html lang="de"><body style="margin:0;background:#f3f6f7"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="620" style="max-width:620px;width:100%;background:#fff;border-radius:12px"><tr><td style="padding:28px 32px">
<img src="${L.BASE_URL}/brand/clean-service-logo.png" width="180" alt="Clean Service by Scaramuzzo" style="display:block;width:180px;height:auto;border:0;margin-bottom:20px">
${P(L.esc(L.fill('{Anrede}', d, {})))}
${P('Herzlichen Dank für Ihre Rückmeldung. Wir haben Ihre Betriebsferien für <b>' + L.esc(d.objekt || d.kunde) + '</b> erfasst:')}
<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 16px;background:#eef7f8;border-radius:10px;width:100%"><tr><td style="padding:14px 16px;font-family:Verdana,Geneva,sans-serif;font-size:14px;line-height:1.6;color:#3c3c3b"><b>${L.esc(L.fmtDate(b.von))} – ${L.esc(L.fmtDate(b.bis))}</b><br>${lines.map(L.esc).join('<br>')}${note ? '<br><i>«' + L.esc(note) + '»</i>' : ''}</td></tr></table>
${P('Wir planen die Einsätze entsprechend. Änderungen sind bis zum ' + L.esc(L.fmtDate(d.deadline)) + ' über denselben Link möglich: <a href="' + L.BASE_URL + '/r/' + token + '" style="color:#1b8384">Betriebsferien anpassen</a>')}
${P('Freundliche Grüsse<br>Clean Service Scaramuzzo AG · Unterhaltsreinigung · T 0844 355 355')}
</td></tr></table></td></tr></table></body></html>`;
      const from = `${process.env.SENDER_NAME || 'Clean Service Scaramuzzo AG · Unterhaltsreinigung'} <noreply@clean-service.ch>`;
      const to = []; if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email || '')) to.push(d.email);
      if (to.length) await L.resendSend({ from, to, reply_to: s.reply_to, subject: `Bestätigung Betriebsferien – ${d.kunde}`, html, text: `${L.fill('{Anrede}', d, {})}\n\nWir haben Ihre Betriebsferien erfasst: ${sum}${note ? '\nBemerkung: ' + note : ''}\n\nClean Service Scaramuzzo AG · Unterhaltsreinigung` });
      const cc = process.env.CC_RESPONSES || 'unterhaltsreinigung@clean-service.ch';
      if (cc) await L.resendSend({ from, to: [cc], subject: `Betriebsferien gemeldet: ${d.kunde}${d.objekt ? ' · ' + d.objekt : ''}`, text: `${d.kunde}\n${d.objekt}\n${d.ansprechperson} · ${d.email}\n\n${sum}${note ? '\nBemerkung: ' + note : ''}\n\nIm Eingang: ${L.BASE_URL}/` });
    } catch (e) { console.error('confirmation mail failed', e.message); }

    return L.json(res, 200, { ok: true, kunde: r.kunde, email: r.email });
  } catch (e) {
    return L.json(res, 500, { error: e.message });
  }
};
