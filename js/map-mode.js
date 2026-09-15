import { haversine, nearbyFromGrid } from './geo.js';
import { filterMarkers, deduplicateMetroEntrances, markerModes } from './markers.js';
import { TRANSIT_ICONS } from './transit.js';

export function mapOrientation(rotationMode, heading) {
  if (!Number.isFinite(heading)) return { bearing: 0, arrow: null, effectiveMode: 'north-up' };
  return rotationMode === 'heading-up'
    ? { bearing: heading, arrow: 0, effectiveMode: 'heading-up' }
    : { bearing: 0, arrow: heading, effectiveMode: 'north-up' };
}

export const mapStopClickHandler = (stop, select) => event => {
  event.stopPropagation();
  select(stop);
};

export const mapTileUrl = apiKey => `https://api.mapy.com/v1/maptiles/basic/256/{z}/{x}/{y}?apikey=${encodeURIComponent(apiKey)}`;

export function mapStyle(apiKey) {
  return { version: 8, sources: { 'basic-tiles': { type: 'raster', tiles: [mapTileUrl(apiKey)], tileSize: 256, minzoom: 0, maxzoom: 20,
    attribution: '<a href="https://api.mapy.com/copyright" target="_blank">© Seznam.cz a.s. a další</a>' } }, layers: [{ id: 'tiles', type: 'raster', source: 'basic-tiles' }] };
}

export function stopLngLat(stop) {
  const longitude = Number(stop.lon), latitude = Number(stop.lat);
  return Number.isFinite(longitude) && Number.isFinite(latitude) ? [longitude, latitude] : null;
}

export class MapMode {
  constructor({ root, container, error, compass, config, state, select, loadLibrary = loadMapLibre, onDiagnosticsChange = () => {} }) {
    Object.assign(this, { root, container, error, compass, config, state, select, loadLibrary, onDiagnosticsChange });
    this.map = null; this.markers = []; this.lastMarkerPosition = null; this.initializing = null;
    this.libraryLoaded = false; this.mapLoaded = false; this.lastError = null;
    compass.onclick = () => { state.mapRotationMode = state.mapRotationMode === 'heading-up' ? 'north-up' : 'heading-up'; localStorage.setItem('pid-ar-map-rotation-mode', state.mapRotationMode); this.updateOrientation(); };
  }
  async show() {
    this.root.classList.remove('hidden');
    try { await this.ensureMap(); this.map.resize(); this.updatePosition(true); }
    catch (error) { this.lastError = { message: error?.message ?? String(error ?? ''), status: error?.status ?? null }; this.error.classList.remove('hidden'); this.onDiagnosticsChange(); }
  }
  hide() { this.root.classList.add('hidden'); }
  async ensureMap() {
    if (this.map) return this.map;
    if (this.initializing) return this.initializing;
    this.initializing = this.loadLibrary().then(maplibregl => {
      this.lib = maplibregl;
      this.libraryLoaded = true; this.onDiagnosticsChange();
      if (!this.config.mapyApiKey) throw new Error('Mapy.com API key is not configured');
      this.map = new maplibregl.Map({
        container: this.container, center: [this.state.rawPosition?.longitude || 14.42, this.state.rawPosition?.latitude || 50.08], zoom: this.config.mapZoom,
        minZoom: this.config.mapMinZoom, maxZoom: this.config.mapMaxZoom, dragPan: false, dragRotate: false, touchPitch: false,
        style: mapStyle(this.config.mapyApiKey),
        attributionControl: true
      });
      this.onDiagnosticsChange();
      this.map.on('error', event => { this.lastError = { message: event?.error?.message ?? String(event?.error ?? ''), status: event?.error?.status ?? null }; if (!this.mapLoaded) this.error.classList.remove('hidden'); this.onDiagnosticsChange(); });
      this.map.on('load', () => { this.mapLoaded = true; this.error.classList.add('hidden'); this.updatePosition(true); this.onDiagnosticsChange(); });
      return this.map;
    }).finally(() => { this.initializing = null; });
    return this.initializing;
  }
  updatePosition(forceMarkers = false) {
    if (!this.map || !this.state.rawPosition) return;
    const p = this.state.rawPosition;
    this.map.easeTo({ center: [p.longitude, p.latitude], duration: 180, essential: true });
    this.updateOrientation();
    if (forceMarkers || !this.lastMarkerPosition || haversine(p, this.lastMarkerPosition) >= this.config.mapMarkerRefreshMeters) this.updateStops();
  }
  updateOrientation() {
    if (!this.map) return;
    const value = mapOrientation(this.state.mapRotationMode, this.state.heading);
    this.map.setBearing(value.bearing);
    this.compass.dataset.mode = value.effectiveMode;
    this.compass.setAttribute('aria-label', value.effectiveMode === 'heading-up' ? 'Mapa podle směru pohledu' : 'Sever nahoře');
    this.root.style.setProperty('--user-arrow-rotation', value.arrow === null ? '0deg' : `${value.arrow}deg`);
    this.root.classList.toggle('heading-unavailable', value.arrow === null);
  }
  updateStops() {
    if (!this.map || !this.state.grid || !this.state.rawPosition) return;
    this.markers.forEach(marker => marker.remove()); this.markers = [];
    const stops = deduplicateMetroEntrances(filterMarkers(nearbyFromGrid(this.state.grid, this.state.rawPosition, this.config.mapNearbyRadiusMeters, this.config.gridCellDegrees), this.state.enabledModes, { date: new Date(), config: this.config, showNightStopsDuringDay: this.state.showNightStopsDuringDay })).slice(0, this.config.mapMaxMarkers);
    for (const stop of stops) {
      const lngLat = stopLngLat(stop);
      if (!lngLat) continue;
      const el = document.createElement('button'); el.className = 'map-stop'; el.setAttribute('aria-label', stop.name);
      for (const mode of markerModes(stop)) { const img = document.createElement('img'); img.src = `icons/transit/${TRANSIT_ICONS[mode]}`; img.alt = ''; el.append(img); }
      el.onclick = mapStopClickHandler(stop, this.select);
      this.markers.push(new this.lib.Marker({ element: el, rotationAlignment: 'viewport' }).setLngLat(lngLat).addTo(this.map));
    }
    this.lastMarkerPosition = { ...this.state.rawPosition };
  }
  get markerCount() { return this.markers.length; }
}

export function loadMapLibre() {
  if (globalThis.maplibregl) return Promise.resolve(globalThis.maplibregl);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'js/vendor/maplibre-gl.js'; script.onload = () => globalThis.maplibregl ? resolve(globalThis.maplibregl) : reject(new Error('MapLibre GL JS se načetl, ale objekt maplibregl není dostupný')); script.onerror = () => reject(new Error(`MapLibre GL JS se nepodařilo načíst ze souboru ${script.src}`)); document.head.append(script);
  });
}
