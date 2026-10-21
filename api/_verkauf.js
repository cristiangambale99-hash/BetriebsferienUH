// Gewonnene Aufträge aus dem Verkaufstool UH übernehmen (nur lesen). Aktiv, sobald VERKAUF_* gesetzt sind.
const L = require('./_lib');
let last = 0;

// «Frau» + «Petrissa Eckle» -> «Fr. Eckle, Petrissa» (gleiches Format wie die Excel-Liste)
function person(anrede, kontakt) {
  const k = String(kontakt || '').trim(); if (!k) return '';
  const p = k.split(/\s+/); const nach = p.length > 1 ? p.pop() : p[0]; const vor = p.length ? p.join(' ') : '';
  const t = /^frau/i.test(anrede || '') ? 'Fr. ' : /^herr/i.test(anrede || '') ? 'Hr. ' : '';
  return t + nach + (vor ? ', ' + vor : '');
}
function ort(adr) { const m = String(adr || '').match(/\b(\d{4}\s+[^,]+)\s*$/); return m ? m[1].trim() : ''; }

async function syncVerkauf({ force = false } = {}) {
  const url = process.env.VERKAUF_SB_URL, key = process.env.VERKAUF_SB_ANON, sec = process.env.VERKAUF_KEY;
  if (!url || !key || !sec) return { skipped: 'nicht verbunden' };
  if (!force && Date.now() - last < 3 * 60 * 1000) return { skipped: 'kürzlich' };
  last = Date.now();
  const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/bf_export_won`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: key, authorization: `Bearer ${key}` }, body: JSON.stringify({ p_key: sec }) });
  if (!r.ok) throw new Error('Verkaufstool ' + r.status);
  const won = await r.json();
  const rows = (won || []).filter(w => w.ext_id && w.firma).map(w => {
    const o = ort(w.kunden_adresse || w.objekt);
    return { ext_id: w.ext_id, kunde: w.firma + (o ? ', ' + o : ''), objekt: w.objekt || '', ansprechperson: person(w.anrede, w.kontakt), email: (w.email || '').trim().toLowerCase() };
  });
  if (!rows.length) return { inserted: 0, updated: 0 };
  return L.adminCust('sync', { rows });
}
module.exports = { syncVerkauf };
