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

// HTML-Mail: tabellenbasiert, Verdana (Hausschrift für Mails), Logo als gehostetes Bild
function mailHtml(c, s, { reminder = false } = {}) {
  const body = fill(s.body || DEFAULT_BODY, c, s);
  const paras = body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const link = `${BASE_URL}/r/${c.token}`;
  const btnLabel = reminder ? 'Betriebsferien jetzt melden' : 'Betriebsferien melden';
  // Knopf nach dem Absatz einsetzen, der den Hinweis auf den Knopf enthält (sonst nach dem 2. Absatz)
  let idx = paras.findIndex(p => /Knopf|Link/i.test(p)); if (idx < 0) idx = Math.min(1, paras.length - 1);
  const P = p => `<p style="margin:0 0 14px;font-family:Verdana,Geneva,sans-serif;font-size:14px;line-height:1.65;color:#3c3c3b">${esc(p).replace(/\n/g, '<br>')}</p>`;
  const btn = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:6px 0 18px"><tr><td style="background:#1b8384;border-radius:8px"><a href="${link}" style="display:inline-block;padding:13px 24px;font-family:Verdana,Geneva,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none">${btnLabel}</a></td></tr></table>`;
  let html = '';
  paras.forEach((p, i) => { if (reminder && i === 1) html += P(fill(REMIND_INTRO, c, s)); html += P(p); if (i === idx) html += btn; });
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(fill(s.subject, c, s))}</title></head>
<body style="margin:0;padding:0;background:#f3f6f7">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f6f7"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="620" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;width:100%;background:#ffffff;border-radius:12px">
<tr><td style="padding:28px 32px 8px"><img src="${BASE_URL}/brand/clean-service-logo.png" width="180" alt="Clean Service by Scaramuzzo" style="display:block;width:180px;height:auto;border:0"></td></tr>
<tr><td style="padding:12px 32px 8px">${html}</td></tr>
<tr><td style="padding:8px 32px 28px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-top:1px solid #dcebee;padding-top:14px;font-family:Verdana,Geneva,sans-serif;font-size:11.5px;line-height:1.6;color:#767676">
<span style="color:#60beb3;font-weight:bold">Clean Service Scaramuzzo AG</span><br>Unterhaltsreinigung<br>Industriestrasse 5 · 8307 Effretikon<br>T 0844 355 355 · ${esc(s.reply_to)} · clean-service.ch<br><br><span style="color:#60beb3;font-weight:bold">DIE NEUE WELT VON CLEAN SERVICE.</span>
</td></tr></table></td></tr>
</table>
<p style="margin:14px 0 0;font-family:Verdana,Geneva,sans-serif;font-size:11px;color:#9aa5a8">Diese Nachricht wurde automatisch versendet. Antworten Sie bitte nicht direkt auf diese E-Mail, sondern über den Link oder an ${esc(s.reply_to)}.</p>
</td></tr></table></body></html>`;
}
function mailText(c, s, { reminder = false } = {}) {
  const body = fill(s.body || DEFAULT_BODY, c, s);
  const link = `${BASE_URL}/r/${c.token}`;
  return (reminder ? fill(REMIND_INTRO, c, s) + '\n\n' : '') + body + `\n\nBetriebsferien melden: ${link}\n\nClean Service Scaramuzzo AG · Industriestrasse 5 · 8307 Effretikon · T 0844 355 355`;
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

module.exports = { admin, pub, readBody, json, isAdmin, fmtDate, esc, fill, mailHtml, mailText, resendSend, resendBatch, DEFAULT_BODY, BASE_URL };
