// Meldung an den Beekeeper-Chat der Mitarbeitenden (Info, wenn ein Kunde Betriebsferien meldet).
// Aktiv, sobald BEEKEEPER_URL, BEEKEEPER_TOKEN und BEEKEEPER_CHAT_ID in Vercel gesetzt sind.
const L = require('./_lib');

function text(c, r, { update = false, manual = false } = {}) {
  const weeks = r.weeks || {};
  const lines = Object.keys(weeks).sort((a, b) => +a - +b).map(kw => `KW ${kw}: ${+weeks[kw] === 0 ? 'kein Einsatz' : weeks[kw] + '× reduziert'}`);
  return [
    update ? 'Betriebsferien geändert' : 'Betriebsferien gemeldet' + (manual ? ' (telefonisch)' : ''),
    '',
    c.kunde,
    c.objekt || '',
    '',
    `Ferien: ${L.fmtDate(r.von)} – ${L.fmtDate(r.bis)}`,
    ...lines,
    r.note ? `Bemerkung: ${String(r.note).trim()}` : ''
  ].filter((x, i, a) => x !== '' || (a[i - 1] !== '' && i > 0)).join('\n').trim();
}

async function notify(c, r, opt) {
  const base = String(process.env.BEEKEEPER_URL || '').replace(/\/+$/, '').replace(/^(?!https?:\/\/)/, 'https://');
  const token = process.env.BEEKEEPER_TOKEN, chat = process.env.BEEKEEPER_CHAT_ID;
  if (!base || !token || !chat) return { skipped: true };
  const res = await fetch(`${base}/api/2/chats/groups/${encodeURIComponent(chat)}/messages`, {
    method: 'POST',
    headers: { Authorization: 'Token ' + token, 'Content-Type': 'application/json', Accept: 'application/json, application/vnd.io.beekeeper.chats+json;version=1' },
    body: JSON.stringify({ body: text(c, r, opt) })
  });
  if (!res.ok) throw new Error('Beekeeper ' + res.status + ' ' + (await res.text()).slice(0, 200));
  return { ok: true };
}
module.exports = { notify, text };
