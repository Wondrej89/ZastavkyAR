import { CONFIG } from '../js/config.js';
export class DeparturesError extends Error {}
export async function getDepartures(stopId, signal) {
  if (!CONFIG.apiBaseUrl) throw new DeparturesError('Aktuální odjezdy zatím nejsou dostupné.');
  const url = new URL(`${CONFIG.apiBaseUrl.replace(/\/$/, '')}/departures`); url.searchParams.set('stop', stopId);
  let response; try { response = await fetch(url, { signal }); } catch (_) { throw new DeparturesError('Odjezdy nelze načíst. Zkontrolujte připojení.'); }
  if (!response.ok) throw new DeparturesError('Služba odjezdů je dočasně nedostupná.');
  const data = await response.json(); if (!Array.isArray(data.departures)) throw new DeparturesError('Služba vrátila neplatná data.'); return data;
}
