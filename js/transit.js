export const TRANSIT_ICONS = Object.freeze({
  0: 'travel-tram.svg', 1: 'travel-metro.svg', 2: 'travel-train.svg',
  3: 'travel-bus.svg', 4: 'travel-ferry.svg', 7: 'travel-cableway.svg',
  11: 'travel-trolley.svg',
});

export const METRO_LINE_COLORS = Object.freeze({ A:'#02A848', B:'#FFBD0E', C:'#FF0917', D:'#002177' });
export const METRO_LINE_ORDER = Object.freeze(['A', 'B', 'C', 'D']);
const NIGHT_CAPABLE_MODES = new Set([0, 3, 11]);

// GTFS has no standard night-service field. PID's official number ranges are
// kept here and constrained by mode and an exact numeric short name.
export function isNightRoute(route = {}) {
  for (const key of ['isNight', 'is_night', 'night_service']) {
    const value = route[key];
    if (value === true || String(value).toLowerCase() === 'true' || String(value) === '1') return NIGHT_CAPABLE_MODES.has(Number(route.route_type));
    if (value === false || String(value).toLowerCase() === 'false' || String(value) === '0') return false;
  }
  const mode = Number(route.route_type);
  if (!NIGHT_CAPABLE_MODES.has(mode)) return false;
  const name = String(route.route_short_name ?? route.route ?? '').trim();
  if (!/^\d+$/.test(name)) return false;
  const number = Number(name);
  return mode === 0 ? number >= 91 && number <= 99 :
    (number >= 901 && number <= 917) || (number >= 951 && number <= 960);
}

export function transitIconNames(modes = [], showNightService = false) {
  const uniqueModes = [...new Set(modes.map(Number))];
  const icons = uniqueModes.map(mode => TRANSIT_ICONS[mode]).filter(Boolean);
  if (showNightService && uniqueModes.some(mode => NIGHT_CAPABLE_MODES.has(mode))) icons.push('travel-night.svg');
  return icons;
}

export function markerServiceTypes(marker = {}) {
  const hasNightService = marker.hasNightService === true || (Array.isArray(marker.nightLines) && marker.nightLines.length > 0);
  const hasDayService = marker.hasDayService === true || (Array.isArray(marker.dayLines) && marker.dayLines.length > 0);
  return { hasNightService, hasDayService, nightOnly:hasNightService && !hasDayService };
}

export function isNightServiceTime(date, startHour, endHour) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone:'Europe/Prague', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const localHour = Number(value.hour) + Number(value.minute) / 60 + Number(value.second) / 3600;
  return startHour < endHour
    ? localHour >= startHour && localHour < endHour
    : localHour >= startHour || localHour < endHour;
}

export function markerHasNightIndicator(marker, date, config, showNightStopsDuringDay = true) {
  const { hasNightService, nightOnly } = markerServiceTypes(marker);
  const isNightTime=isNightServiceTime(date, config.nightServiceStartHour, config.nightServiceEndHour);
  return hasNightService && (isNightTime || (showNightStopsDuringDay && nightOnly));
}

export function departureHasNightIndicator(departure = {}) {
  const route = { route_short_name:departure.route, route_type:departure.routeType };
  return (departure.isNight === true && NIGHT_CAPABLE_MODES.has(Number(departure.routeType))) || isNightRoute(route);
}

export function departureTimeClass(departure = {}) {
  if (!departure.realtime || !Number.isFinite(departure.delaySeconds)) return 'time';
  return departure.delaySeconds > 60 ? 'time realtime-delayed' : 'time realtime-on-time';
}
