import { CONFIG } from '../js/config.js';
export class DeparturesError extends Error {
  constructor(message, { status = null, body = '', url = '' } = {}) { super(message); this.name='DeparturesError'; this.status=status; this.body=body; this.url=url; }
  debugMessage() { return this.status ? `Worker HTTP ${this.status}${this.body ? `: ${this.body}` : ''}` : this.message; }
}
export function departuresUrl(stopId, apiBaseUrl = CONFIG.apiBaseUrl) {
  const url = new URL(`${apiBaseUrl}/departures`);
  const stops=Array.isArray(stopId)?stopId:[stopId];url.searchParams.set(stops.length>1?'stops':'stop',stops.join(','));
  return url;
}
export async function getDepartures(stopId, signal, onDebug = () => {}) {
  if (!CONFIG.apiBaseUrl) throw new DeparturesError('Aktuální odjezdy zatím nejsou dostupné.');
  const url = departuresUrl(stopId);
  onDebug({ url:url.href, status:null });
  let response; try { response = await fetch(url, { signal }); } catch (_) { throw new DeparturesError('Odjezdy nelze načíst. Zkontrolujte připojení.', { url:url.href }); }
  onDebug({ url:url.href, status:response.status });
  if (!response.ok) { const body=(await response.text()).trim().slice(0,500); throw new DeparturesError('Služba odjezdů je dočasně nedostupná.', { status:response.status, body, url:url.href }); }
  const data = await response.json(); if (!Array.isArray(data.departures)) throw new DeparturesError('Služba vrátila neplatná data.'); return data;
}
