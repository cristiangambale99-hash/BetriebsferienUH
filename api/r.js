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

    // Info an die Mitarbeitenden im Beekeeper-Chat (Fehler blockieren die Meldung nicht)
    try {
      const c0 = await L.pub('get', { token });
      await require('./_beekeeper').notify(c0, { von: b.von, bis: b.bis, weeks, note: String(b.note || '').trim() }, { update: !!(c0.response && c0.response.created_at && c0.response.updated_at && c0.response.created_at !== c0.response.updated_at) });
    } catch (e) { console.error('beekeeper failed', e.message); }

    // Bestätigung an Kunde + Kopie an UH (Fehler hier dürfen die Meldung nicht blockieren)
    try {
      const d = await L.pub('get', { token });
      const s = { reply_to: process.env.REPLY_TO_FALLBACK || 'unterhaltsreinigung@clean-service.ch' };
      const lines = weekLines(weeks);
      const sum = `Betriebsferien ${L.fmtDate(b.von)} – ${L.fmtDate(b.bis)}` + (lines.length ? ' · ' + lines.join(' · ') : '');
      const note = String(b.note || '').trim();
      const F = 'font-family:Verdana,Geneva,sans-serif;';
      const P = t => `<p style="margin:0 0 16px;${F}font-size:14px;line-height:22px;color:#3c3c3b">${t}</p>`;
      const wr = L.weekRanges(b.von, b.bis);
      const rows = Object.keys(weeks).sort((a, b) => +a - +b).map(kw => `<tr><td style="padding:9px 14px;border-top:1px solid #dcebee;${F}font-size:14px;color:#3c3c3b">KW ${kw}${wr[kw] ? ' <span style="color:#767676">(' + wr[kw] + ')</span>' : ''}</td><td align="right" style="padding:9px 14px;border-top:1px solid #dcebee;${F}font-size:14px;font-weight:bold;color:${+weeks[kw] === 0 ? '#3c3c3b' : '#1b8384'}">${+weeks[kw] === 0 ? 'Kein Einsatz' : weeks[kw] + '× reduziert'}</td></tr>`).join('');
      const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#ffffff">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff"><tr><td align="left" style="padding:24px 20px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px">
<tr><td style="padding:0 0 30px"><img src="cid:cs-logo" width="190" height="60" alt="Clean Service by Scaramuzzo" style="display:block;width:190px;height:60px;border:0"></td></tr>
<tr><td>
${P(L.esc(L.fill('{Anrede}', d, {})))}
${P('Herzlichen Dank für Ihre Rückmeldung. Wir haben Ihre Betriebsferien für ' + L.esc(d.objekt || d.kunde) + ' erfasst und planen die Reinigung entsprechend.')}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px;border:1px solid #dcebee;border-radius:8px;border-collapse:separate">
<tr><td colspan="2" bgcolor="#eef7f8" style="background:#eef7f8;padding:12px 14px;${F}font-size:14px;color:#3c3c3b"><span style="font-size:11px;letter-spacing:1px;color:#767676">IHRE BETRIEBSFERIEN</span><br><b style="font-size:15px">${L.esc(L.fmtDate(b.von))} – ${L.esc(L.fmtDate(b.bis))}</b></td></tr>
${rows}${note ? `<tr><td colspan="2" style="padding:9px 14px;border-top:1px solid #dcebee;${F}font-size:14px;color:#3c3c3b"><b>Bemerkung:</b> ${L.esc(note)}</td></tr>` : ''}
</table>
${P('Falls sich etwas ändert, können Sie Ihre Angaben jederzeit über denselben Link anpassen: <a href="' + L.BASE_URL + '/r/' + token + '" style="color:#1b8384">Betriebsferien anpassen</a>')}
${P('Freundliche Grüsse<br><br>Clean Service Scaramuzzo AG<br>Unterhaltsreinigung')}
</td></tr>
<tr><td style="border-top:1px solid #dcebee;padding-top:14px;${F}font-size:12px;line-height:19px;color:#767676">Industriestrasse 5 · 8307 Effretikon<br>T 0844 355 355 · <a href="mailto:${s.reply_to}" style="color:#1b8384;text-decoration:none">${s.reply_to}</a> · <a href="https://www.clean-service.ch" style="color:#1b8384;text-decoration:none">clean-service.ch</a></td></tr>
</table></td></tr></table></body></html>`;
      const from = `${process.env.SENDER_NAME || 'Clean Service Scaramuzzo AG · Unterhaltsreinigung'} <noreply@clean-service.ch>`;
      const to = []; if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email || '')) to.push(d.email);
      if (to.length) await L.resendSend({ from, to, reply_to: s.reply_to, subject: `Bestätigung Betriebsferien – ${d.kunde}`, html, attachments: [L.logoAttachment()], text: `${L.fill('{Anrede}', d, {})}\n\nWir haben Ihre Betriebsferien erfasst: ${sum}${note ? '\nBemerkung: ' + note : ''}\n\nClean Service Scaramuzzo AG · Unterhaltsreinigung` });
      const cc = process.env.CC_RESPONSES || 'unterhaltsreinigung@clean-service.ch';
      if (cc) await L.resendSend({ from, to: [cc], subject: `Betriebsferien gemeldet: ${d.kunde}${d.objekt ? ' · ' + d.objekt : ''}`, text: `${d.kunde}\n${d.objekt}\n${d.ansprechperson} · ${d.email}\n\n${sum}${note ? '\nBemerkung: ' + note : ''}\n\nIm Eingang: ${L.BASE_URL}/` });
    } catch (e) { console.error('confirmation mail failed', e.message); }

    return L.json(res, 200, { ok: true, kunde: r.kunde, email: r.email });
  } catch (e) {
    return L.json(res, 500, { error: e.message });
  }
};
