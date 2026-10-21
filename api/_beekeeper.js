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

// Alle Gruppenchats des UH-Bots (10 Min. zwischengespeichert)
let cache = { at: 0, chats: [] };
async function chats() {
  if (Date.now() - cache.at < 10 * 60 * 1000 && cache.chats.length) return cache.chats;
  const out = [], seen = new Set();
  for (let off = 0; off < 5000; off += 200) {
    const r = await fetch(`${BASE()}/api/2/chats/groups?limit=200&offset=${off}`, { headers: HDR() });
    if (!r.ok) throw new Error('Beekeeper-Chats ' + r.status);
    const j = await r.json(); const arr = (j && j.chats) || [];
    let neu = 0; arr.forEach(c => { if (!seen.has(c.id)) { seen.add(c.id); out.push({ id: c.id, title: c.title || '', desc: c.description || '' }); neu++; } });
    if (!neu || arr.length < 200) break;
  }
  cache = { at: Date.now(), chats: out };
  return out;
}

// Normalisieren: «Friesenbergstr. 108» = «friesenbergstrasse108»
const N = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/str\.(?=\s|\d|$)/g, 'strasse').replace(/[^a-z0-9]/g, '');
const STOP = /^(ag|gmbh|sa|sarl|ltd|the|die|der|das|und|zurich|zuerich|schweiz|switzerland|swiss|stiftung|verein|praxis|dr|med)$/;
function firmaWords(kunde) { return String(kunde || '').split(',')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.test(w)); }

// Richtigen Kundenchat finden: Adresse (Strasse + Nr.) im Chat, bei mehreren Treffern zusätzlich der Firmenname
function match(list, c) {
  const street = N(String(c.objekt || '').split(',')[0]);
  const fw = firmaWords(c.kunde);
  const scored = list.map(ch => {
    const t = N(ch.title), d = N(ch.title + ' ' + ch.desc);
    const s = (street.length > 5 && /\d/.test(street) && d.includes(street) ? 2 : 0) + (fw.length && fw.some(w => t.includes(w)) ? 1 : 0)
      + (c.nr && new RegExp('obj\\s*' + c.nr + '(?!\\d)', 'i').test(ch.title) ? 3 : 0);
    return { ch, s };
  }).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  if (!scored.length) return null;
  const top = scored[0];
  if (top.s >= 3 || (top.s === 2 && scored.filter(x => x.s === 2).length === 1)) return top.ch;
  if (top.s === 1 && scored.length === 1) return top.ch;   // nur Firmenname, aber eindeutig
  return null;
}

async function notify(c, r, opt) {
  if (!process.env.BEEKEEPER_URL || !process.env.BEEKEEPER_TOKEN) return { skipped: true };
  const ch = match(await chats(), c);
  const id = ch ? ch.id : process.env.BEEKEEPER_CHAT_ID;   // Ersatz-Chat, falls kein Kundenchat gefunden
  if (!id) return { ok: false, error: 'Kein Kundenchat gefunden' };
  const res = await fetch(`${BASE()}/api/2/chats/groups/${encodeURIComponent(id)}/messages`, { method: 'POST', headers: HDR(), body: JSON.stringify({ body: text(c, r, opt) + (ch ? '' : '\n\n(Kein Kundenchat gefunden)') }) });
  if (!res.ok) throw new Error('Beekeeper ' + res.status + ' ' + (await res.text()).slice(0, 200));
  return { ok: true, chat: ch ? ch.title : 'Ersatz-Chat' };
}
module.exports = { notify, text, chats, match };
