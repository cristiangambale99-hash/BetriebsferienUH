// Gemeinsame Helfer für die Vercel-Funktionen (Betriebsferien UH)
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_ANON_KEY;
const DB_SECRET = process.env.BF_DB_SECRET;
const BASE_URL = (process.env.BASE_URL || '').replace(/\/$/, '');

async function rpc(fn, args) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: SB_KEY, authorization: `Bearer ${SB_KEY}` },
    body: JSON.stringify(args)
  });
  const t = await r.text();
  let j; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  if (!r.ok) throw new Error((j && (j.message || j.hint)) || `DB ${r.status}`);
  return j;
}
const admin = (action, p = {}) => rpc('bf_admin', { p_secret: DB_SECRET, p_action: action, p });
const pub = (action, p = {}) => rpc('bf_public', { p_action: action, p });

function readBody(req) {
  return new Promise((res, rej) => {
    if (req.body !== undefined) { try { return res(typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})); } catch (e) { return rej(e); } }
    let d = ''; req.on('data', c => d += c); req.on('end', () => { try { res(d ? JSON.parse(d) : {}); } catch (e) { rej(e); } }); req.on('error', rej);
  });
}
function json(res, status, obj) { res.statusCode = status; res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(obj)); }
function isAdmin(req) { const h = req.headers['x-admin-password'] || ''; return !!process.env.ADMIN_PASSWORD && h === process.env.ADMIN_PASSWORD; }

const MON = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
function fmtDate(iso) { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return `${d}. ${MON[m - 1]} ${y}`; }
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// Anrede aus Ansprechperson: «Frau Keller» / «Herr Brunner» nur wenn Titel bekannt, sonst voller Name
function anrede(ansprechperson) {
  // Excel-Format: «Fr. Calonder, Lara (044 …)» / «Hr. Özman, Onur» / «Kluemper, Ute»
  const a = String(ansprechperson || '').replace(/\(.*?\)/g, '').trim();
  if (!a) return 'Guten Tag';
  const m = a.match(/^(Fr\.|Frau|Hr\.|Herrn?)\s*(.+)$/i);
  if (m) return `Guten Tag ${/^fr/i.test(m[1]) ? 'Frau' : 'Herr'} ${m[2].split(',')[0].trim()}`;
  const p = a.split(',').map(x => x.trim()).filter(Boolean);
  return `Guten Tag ${p.length === 2 ? p[1] + ' ' + p[0] : a}`;
}

function fill(tpl, c, s) {
  const map = {
    Ansprechperson: anrede(c.ansprechperson).replace(/^Guten Tag\s?/, ''),
    Anrede: anrede(c.ansprechperson),
    Kunde: c.kunde || '',
    Objekt: c.objekt ? `Ihr Objekt ${c.objekt}` : 'Ihr Objekt',
    Von: fmtDate(s.period_from), Bis: fmtDate(s.period_to), Frist: fmtDate(s.deadline),
    Link: `${BASE_URL}/r/${c.token}`
  };
  return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
}

const DEFAULT_BODY = `{Anrede}

Über die Festtage reinigen wir {Objekt} wie gewohnt an den vereinbarten Tagen. Dafür müssen Sie nichts unternehmen.

Falls Ihr Betrieb über Weihnachten und Neujahr Betriebsferien hat und Sie in dieser Zeit keinen oder einen reduzierten Reinigungseinsatz wünschen, teilen Sie uns dies bitte über den folgenden Knopf mit. Sie erfassen Ihre Betriebsferien von–bis und legen für jede betroffene Kalenderwoche fest, ob gar kein Einsatz oder ein reduzierter Einsatz stattfinden soll. Das dauert weniger als eine Minute.

Herzlichen Dank für Ihr Vertrauen und freundliche Grüsse

Clean Service Scaramuzzo AG
Unterhaltsreinigung`;

const REMIND_INTRO = `Vor einigen Tagen haben wir Sie zu Ihren Betriebsferien über Weihnachten und Neujahr angefragt. Falls bei Ihnen alles wie gewohnt läuft, ist nichts weiter nötig. Falls Sie Betriebsferien haben und weniger oder keine Reinigung wünschen, freuen wir uns über Ihre kurze Rückmeldung.`;

// HTML-Mail: wirkt wie ein normaler Geschäftsbrief (weisser Hintergrund, linksbündig, Signatur).
// Logo als Inline-Bild (cid:cs-logo) – Outlook blockiert es so nicht. In der Vorschau: gehostete URL.
const LOGO_CID = 'cs-logo';
function logoAttachment() { return { filename: 'clean-service-logo.png', content: require('./_logo'), content_type: 'image/png', content_id: LOGO_CID }; }
const F = 'font-family:Verdana,Geneva,sans-serif;';
function mailHtml(c, s, { reminder = false, inline = false } = {}) {
  const body = fill(s.body || DEFAULT_BODY, c, s);
  const paras = body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const link = `${BASE_URL}/r/${c.token}`;
  const logo = inline ? `cid:${LOGO_CID}` : `${BASE_URL}/brand/clean-service-logo.png`;
  const btnLabel = reminder ? 'Betriebsferien jetzt melden' : 'Betriebsferien melden';
  let idx = paras.findIndex(p => /Knopf|Link/i.test(p)); if (idx < 0) idx = Math.min(1, paras.length - 1);
  const P = p => `<p style="margin:0 0 16px;${F}font-size:14px;line-height:22px;color:#3c3c3b">${esc(p).replace(/\n/g, '<br>')}</p>`;
  const btn = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 22px"><tr><td align="center" bgcolor="#1b8384" style="background:#1b8384;border-radius:6px;padding:12px 26px;mso-padding-alt:12px 26px"><a href="${link}" target="_blank" style="${F}font-size:14px;font-weight:bold;line-height:18px;color:#ffffff;text-decoration:none;display:inline-block">${btnLabel}</a></td></tr></table>`;
  let html = '';
  paras.forEach((p, i) => { if (reminder && i === 1) html += P(fill(REMIND_INTRO, c, s)); html += P(p); if (i === idx) html += btn; });
  const rt = esc(s.reply_to || 'unterhaltsreinigung@clean-service.ch');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${esc(fill(s.subject, c, s))}</title></head>
<body style="margin:0;padding:0;background:#ffffff">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="background:#ffffff"><tr><td align="left" style="padding:24px 20px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px">
<tr><td style="padding:0 0 30px"><img src="${logo}" width="190" height="60" alt="Clean Service by Scaramuzzo" style="display:block;width:190px;height:60px;border:0;outline:none"></td></tr>
<tr><td>${html}</td></tr>
<tr><td style="padding:6px 0 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-top:1px solid #dcebee;padding-top:14px;${F}font-size:12px;line-height:19px;color:#767676">
Industriestrasse 5 · 8307 Effretikon<br>T <a href="tel:+41844355355" style="color:#767676;text-decoration:none">0844 355 355</a> · <a href="mailto:${rt}" style="color:#1b8384;text-decoration:none">${rt}</a> · <a href="https://www.clean-service.ch" style="color:#1b8384;text-decoration:none">clean-service.ch</a>
</td></tr></table></td></tr>
</table>
</td></tr></table></body></html>`;
}
function mailText(c, s, { reminder = false } = {}) {
  const body = fill(s.body || DEFAULT_BODY, c, s);
  const link = `${BASE_URL}/r/${c.token}`;
  return (reminder ? fill(REMIND_INTRO, c, s) + '\n\n' : '') + body + `\n\nBetriebsferien melden: ${link}\n\nIndustriestrasse 5 · 8307 Effretikon · T 0844 355 355 · clean-service.ch`;
}

async function resendSend(payload) {
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.RESEND_API_KEY}` }, body: JSON.stringify(payload) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || `Resend ${r.status}`);
  return j;
}
async function resendBatch(items) {
  const r = await fetch('https://api.resend.com/emails/batch', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.RESEND_API_KEY}` }, body: JSON.stringify(items) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || `Resend ${r.status}`);
  return j;
}

module.exports = { logoAttachment, admin, pub, readBody, json, isAdmin, fmtDate, esc, fill, mailHtml, mailText, resendSend, resendBatch, DEFAULT_BODY, BASE_URL };
