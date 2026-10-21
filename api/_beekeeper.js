// Meldung an den Beekeeper-Chat der Mitarbeitenden (Info, wenn ein Kunde Betriebsferien meldet).
// Aktiv, sobald BEEKEEPER_URL, BEEKEEPER_TOKEN und BEEKEEPER_CHAT_ID in Vercel gesetzt sind.
const L = require('./_lib');

function text(c, r, { update = false, manual = false } = {}) {
  const weeks = r.weeks || {};
  const wr = L.weekRanges(r.von, r.bis);
  const lines = Object.keys(weeks).sort((a, b) => +a - +b).map(kw => `Betriebsferien KW ${kw}${wr[kw] ? ' (' + wr[kw] + ')' : ''}: ${+weeks[kw] === 0 ? 'kein Einsatz' : weeks[kw] + '× reduziert'}`);
  return [
    update ? 'Betriebsferien geändert' : 'Betriebsferien gemeldet' + (manual ? ' (telefonisch)' : ''),
    '',
    c.kunde,
    c.objekt || '',
    '',
    `Betriebsferien: ${L.fmtShort(r.von)} – ${L.fmtShort(r.bis)}`,
    ...lines,
    r.note ? `Bemerkung: ${String(r.note).trim()}` : ''
  ].filter((x, i, a) => x !== '' || (a[i - 1] !== '' && i > 0)).join('\n').trim();
}

const BASE = () => String(process.env.BEEKEEPER_URL || '').replace(/\/+$/, '').replace(/^(?!https?:\/\/)/, 'https://');
const HDR = () => ({ Authorization: 'Token ' + process.env.BEEKEEPER_TOKEN, 'Content-Type': 'application/json', Accept: 'application/json, application/vnd.io.beekeeper.chats+json;version=1' });

// Beekeeper-Suche nach Chat-Titel (?q=)
async function search(q) {
  q = String(q || '').replace(/[^\p{L}\p{N} .-]+/gu, ' ').replace(/\s+/g, ' ').trim();
  if (q.length < 2) return [];
  const r = await fetch(`${BASE()}/api/2/chats/groups?q=${encodeURIComponent(q)}`, { headers: HDR() });
  if (r.status === 400) return [];
  if (!r.ok) throw new Error('Beekeeper-Suche ' + r.status);
  const j = await r.json();
  return ((j && j.chats) || []).map(c => ({ id: c.id, title: c.title || '', desc: c.description || '' }));
}

// Normalisieren: «Friesenbergstr. 108» = «friesenbergstrasse108»
const N = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/str\.(?=\s|\d|$)/g, 'strasse').replace(/[^a-z0-9]/g, '');
const STOP = /^(ag|gmbh|sa|sarl|ltd|inc|the|die|der|das|und|zurich|zuerich|schweiz|switzerland|swiss|suisse|stiftung|verein|praxis|dr|med|immobilien|technik|treuhand|partner|consulting|services|holding|management|group|center|zentrum)$/;
const words = kunde => String(kunde || '').split(',')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.test(w));

// Richtigen Kundenchat finden. Titel der Chats: «Firma - OBJ 1234». Nur eindeutige Treffer, sonst null.
const memo = new Map();
async function findChat(c) {
  const key = [c.kunde, c.objekt, c.nr].join('|'); const m = memo.get(key);
  if (m && Date.now() - m.at < 10 * 60 * 1000) return m.ch;
  const ch = await findChat0(c); memo.set(key, { at: Date.now(), ch }); return ch;
}
async function findChat0(c) {
  if (c.nr) {
    const re = new RegExp('(^|\\D)' + String(c.nr).replace(/\D/g, '') + '(\\D|$)');
    const hit = (await search(String(c.nr))).filter(ch => re.test(ch.title));
    if (hit.length === 1) return hit[0];
  }
  const w = words(c.kunde); if (!w.length) return null;
  const seen = new Map();
  for (const q of [String(c.kunde).split(',')[0].trim(), w.slice().sort((a, b) => b.length - a.length)[0]]) {
    for (const ch of await search(q)) seen.set(ch.id, ch);
    if (seen.size) break;
  }
  const street = N(String(c.objekt || '').split(',')[0]);
  const plz = (String(c.objekt || '').match(/\b(\d{4})\s+([A-Za-zÀ-ÿ.\- ]+)/) || []);
  const city = N(plz[2] || '');
  const scored = [...seen.values()].map(ch => {
    const t = N(ch.title), all = N(ch.title + ' ' + ch.desc);
    const fw = w.filter(x => t.includes(N(x))).length;
    let s = fw === w.length ? 2 : fw ? 1 : 0;
    if (street.length > 5 && /\d/.test(street) && all.includes(street)) s += 3;
    if (plz[1] && all.includes(plz[1])) s += 1;
    if (city.length > 2 && t.includes(city)) s += 1;
    return { ch, s };
  }).filter(x => x.s >= 2).sort((a, b) => b.s - a.s);
  if (!scored.length) return null;
  if (scored.length === 1 || scored[0].s > scored[1].s) return scored[0].ch;
  return null;
}

async function notify(c, r, opt) {
  if (!process.env.BEEKEEPER_URL || !process.env.BEEKEEPER_TOKEN) return { skipped: true };
  const ch = await findChat(c);
  const id = ch ? ch.id : process.env.BEEKEEPER_CHAT_ID;   // Ersatz-Chat, falls kein Kundenchat gefunden
  if (!id) return { ok: false, error: 'Kein Kundenchat gefunden' };
  const res = await fetch(`${BASE()}/api/2/chats/groups/${encodeURIComponent(id)}/messages`, { method: 'POST', headers: HDR(), body: JSON.stringify({ body: text(c, r, opt) + (ch ? '' : '\n\n(Kein Kundenchat gefunden)') }) });
  if (!res.ok) throw new Error('Beekeeper ' + res.status + ' ' + (await res.text()).slice(0, 200));
  return { ok: true, chat: ch ? ch.title : 'Ersatz-Chat' };
}
module.exports = { notify, text, findChat, search };
