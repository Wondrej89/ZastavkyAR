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
    this.geolocateControl = null; this.mapGeolocationActive = false; this.mapGeolocateEventCount = 0; this.lastMapGeolocateAt = null;
    compass.onclick = () => { state.mapRotationMode = state.mapRotationMode === 'heading-up' ? 'north-up' : 'heading-up'; localStorage.setItem('pid-ar-map-rotation-mode', state.mapRotationMode); this.updateOrientation(); };
  }
  async show(initialPosition = this.state.rawPosition || this.state.position) {
    this.root.classList.remove('hidden');
    try { await this.ensureMap(initialPosition); this.map.resize(); if (this.state.viewMode !== 'ar') { this.updatePosition(initialPosition, this.mapLoaded); this.activateGeolocation(); } }
    catch (error) { this.lastError = { message: error?.message ?? String(error ?? ''), status: error?.status ?? null }; this.error.classList.remove('hidden'); this.onDiagnosticsChange(); }
  }
  hide() { this.root.classList.add('hidden'); }
  async ensureMap(initialPosition = this.state.rawPosition || this.state.position) {
    if (this.map) return this.map;
    if (this.initializing) return this.initializing;
    this.initializing = this.loadLibrary().then(maplibregl => {
      this.lib = maplibregl;
      this.libraryLoaded = true; this.onDiagnosticsChange();
      if (!this.config.mapyApiKey) throw new Error('Mapy.com API key is not configured');
      this.map = new maplibregl.Map({
        container: this.container, center: [initialPosition?.longitude ?? 14.42, initialPosition?.latitude ?? 50.08], zoom: this.config.mapZoom,
        minZoom: this.config.mapZoom, maxZoom: this.config.mapZoom,
        dragPan: false, dragRotate: false, touchZoomRotate: false, touchPitch: false, scrollZoom: false,
        doubleClickZoom: false, boxZoom: false, keyboard: false,
        style: mapStyle(this.config.mapyApiKey),
        attributionControl: true
      });
      this.onDiagnosticsChange();
      this.map.on('error', event => { this.lastError = { message: event?.error?.message ?? String(event?.error ?? ''), status: event?.error?.status ?? null }; if (!this.mapLoaded) this.error.classList.remove('hidden'); this.onDiagnosticsChange(); });
      this.map.on('load', () => { this.mapLoaded = true; this.error.classList.add('hidden'); if (this.state.viewMode !== 'ar') { this.updatePosition(initialPosition, true); this.activateGeolocation(); } this.onDiagnosticsChange(); });
      return this.map;
    }).finally(() => { this.initializing = null; });
    return this.initializing;
  }
  showError(error) {
    this.error.textContent = this.debug
      ? `Mapu se nepodařilo načíst.\n${mapErrorDetails(error)}`
      : 'Mapu se nepodařilo načíst.\nZkontrolujte připojení.';
    this.error.classList.remove('hidden');
  }
  updatePosition(position = this.state.rawPosition, forceMarkers = false) {
    if (!this.map || !position) return;
    this.map.jumpTo?.({ center: [position.longitude, position.latitude] });
    this.updateOrientation();
    if (forceMarkers) this.updateStops();
  }
  createGeolocateControl() {
    if (this.geolocateControl || !this.map || !this.lib?.GeolocateControl) return this.geolocateControl;
    const control = new this.lib.GeolocateControl({
      positionOptions: { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
      trackUserLocation: true,
      showUserLocation: false,
      showAccuracyCircle: false,
      fitBoundsOptions: { maxZoom: this.config.mapZoom }
    });
    control.on('geolocate', event => this.handleGeolocate(event));
    control.on('trackuserlocationstart', () => { this.mapGeolocationActive = true; this.onDiagnosticsChange(); });
    control.on('trackuserlocationend', () => { this.mapGeolocationActive = false; this.onDiagnosticsChange(); });
    this.map.addControl(control); this.geolocateControl = control;
    return control;
  }
  activateGeolocation() {
    if (!this.mapLoaded || this.state.viewMode === 'ar') return false;
    const control = this.createGeolocateControl();
    if (!control || typeof control.trigger !== 'function') return false;
    if (!this.mapGeolocationActive) control.trigger();
    this.onDiagnosticsChange();
    return true;
  }
  deactivateGeolocation() {
    const control = this.geolocateControl; this.mapGeolocationActive = false;
    if (control && this.map) this.map.removeControl(control);
    this.geolocateControl = null; this.onDiagnosticsChange();
  }
  handleGeolocate(event) {
    if (this.state.viewMode === 'ar') return false;
    const coords = event?.coords;
    const fix = { latitude: coords?.latitude, longitude: coords?.longitude, accuracy: coords?.accuracy, speed: coords?.speed ?? null, timestamp: event?.timestamp ?? Date.now() };
    if (![fix.latitude, fix.longitude, fix.accuracy].every(Number.isFinite)) return false;
    this.state.rawPosition = fix; this.state.lastMapPosition = fix;
    this.mapGeolocateEventCount++; this.lastMapGeolocateAt = Date.now(); this.mapGeolocationActive = true;
    if (typeof this.map?.getZoom === 'function' && Math.abs(this.map.getZoom() - this.config.mapZoom) > 1e-7) this.map.setZoom?.(this.config.mapZoom);
    if (!this.lastMarkerPosition || haversine(fix, this.lastMarkerPosition) >= this.config.mapMarkerRefreshMeters) this.updateStops();
    this.onDiagnosticsChange();
    return true;
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
