import { isNightRoute } from '../js/transit.js';

const SURFACE_ROUTE_TYPES = new Set([0, 3, 4, 7, 11]);

export function activeServiceIdsForDate({ calendar = [], calendarDates = [], serviceDates }) {
  const active = new Set();
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (const date of new Set(serviceDates)) {
    const activeForDate = new Set();
    const compact = date.replaceAll('-', '');
    const weekday = weekdays[new Date(`${date}T12:00:00Z`).getUTCDay()];
    for (const entry of calendar) if (compact >= entry.start_date && compact <= entry.end_date && String(entry[weekday]) === '1') activeForDate.add(entry.service_id);
    for (const exception of calendarDates) if (exception.date === compact) {
      if (String(exception.exception_type) === '1') activeForDate.add(exception.service_id);
      if (String(exception.exception_type) === '2') activeForDate.delete(exception.service_id);
    }
    for (const serviceId of activeForDate) active.add(serviceId);
  }
  return active;
}

export function serviceDatesForTimeZone(now = new Date(), timeZone = 'Europe/Prague') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(now).map(part => [part.type, part.value]));
  const current = `${parts.year}-${parts.month}-${parts.day}`, previous = new Date(`${current}T12:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return [current, previous.toISOString().slice(0, 10)];
}

export function buildMarkersWithStats({ stops, routes, trips, stopTimes, activeServiceIds }) {
  const routeById = new Map(routes.map(route => [route.route_id, route]));
  const tripById = new Map(trips.map(trip => [trip.trip_id, trip]));
  const usage = new Map();
  const passengerRailStops = new Set();
  const activeRailStops = new Set();
  const surfaceStopsWithActiveTrip = new Set();
  const surfaceStopsWithActiveBoarding = new Set();
  const stopsWithInactiveBoarding = new Set();
  const nightRoutes = new Set(routes.filter(isNightRoute).map(route => route.route_id));

  for (const time of stopTimes) {
    const trip = tripById.get(time.trip_id);
    const route = trip && routeById.get(trip.route_id);
    if (!route) continue;
    const routeType = Number(route.route_type);
    const pickupAllowed = String(time.pickup_type ?? '') !== '1';
    if (activeServiceIds && !activeServiceIds.has(trip.service_id)) {
      if (pickupAllowed) stopsWithInactiveBoarding.add(time.stop_id);
      continue;
    }
    if (SURFACE_ROUTE_TYPES.has(routeType)) surfaceStopsWithActiveTrip.add(time.stop_id);
    if (routeType === 2) activeRailStops.add(time.stop_id);

    if (pickupAllowed) {
      if (!usage.has(time.stop_id)) usage.set(time.stop_id, new Map());
      if (!usage.get(time.stop_id).has(routeType)) usage.get(time.stop_id).set(routeType, new Map());
      const routeName = route.route_short_name || route.route_long_name || '';
      usage.get(time.stop_id).get(routeType).set(routeName, usage.get(time.stop_id).get(routeType).get(routeName) || nightRoutes.has(route.route_id));
      if (SURFACE_ROUTE_TYPES.has(routeType)) surfaceStopsWithActiveBoarding.add(time.stop_id);
    }

    // In GTFS an empty pickup/drop-off value means regular service. A railway
    // stop is therefore technical only when both values are explicitly 1 on
    // every stop_time that belongs to a railway trip.
    if (routeType === 2 && (String(time.pickup_type ?? '') !== '1' || String(time.drop_off_type ?? '') !== '1')) {
      passengerRailStops.add(time.stop_id);
    }
  }

  const railwayStopIds = new Set(
    stops
      .filter(stop => Number(stop.location_type || 0) === 0 && activeRailStops.has(stop.stop_id))
      .map(stop => stop.stop_id),
  );
  const statistics = {
    railwayPassengerStops: [...railwayStopIds].filter(id => passengerRailStops.has(id)).length,
    railwayTechnicalStopsExcluded: [...railwayStopIds].filter(id => !passengerRailStops.has(id)).length,
    surfaceStopsExcludedNoPickup: [...surfaceStopsWithActiveTrip].filter(id => !surfaceStopsWithActiveBoarding.has(id)).length,
    stopsExcludedInactiveService: [...stopsWithInactiveBoarding].filter(id => !usage.has(id)).length,
    nightRoutesByMode: {},
  };
  for (const route of routes) if (nightRoutes.has(route.route_id)) {
    const mode = Number(route.route_type);
    statistics.nightRoutesByMode[mode] = (statistics.nightRoutesByMode[mode] || 0) + 1;
  }

  const children = new Map();
  for (const stop of stops) if (stop.parent_station) {
    if (!children.has(stop.parent_station)) children.set(stop.parent_station, []);
    children.get(stop.parent_station).push(stop);
  }

  const markers = [];
  const seen = new Set();
  const add = (raw, extra = {}) => {
    const lat = Number(raw.stop_lat), lon = Number(raw.stop_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const parent = raw.parent_station || raw.stop_id, platform = raw.platform_code || '';
    const key = `${extra.kind || 'surface'}|${parent}|${platform}|${lat.toFixed(5)}|${lon.toFixed(5)}`;
    if (seen.has(key)) return;
    seen.add(key);
    markers.push({ id:`${extra.kind || 'stop'}:${raw.stop_id}`, stopId:raw.stop_id, nodeId:raw.stop_code || null, groupId:parent, name:raw.stop_name, altName:raw.stop_desc || null, platform, lat, lon, physical:true, locationType:Number(raw.location_type || 0), region:raw.zone_id || null, ...extra });
  };

  for (const stop of stops) {
    if (Number(stop.location_type || 0) !== 0) continue;
    const modes = [...(usage.get(stop.stop_id)?.keys() || [])];
    if (modes.includes(1)) continue;
    if (modes.includes(2) && modes.filter(mode => mode !== 2).length === 0) {
      if (passengerRailStops.has(stop.stop_id)) add(stop, { kind:'train_station', stationId:stop.parent_station || stop.stop_id, modes:[2] });
    } else {
      const lineEntries = modes.flatMap(mode => [...(usage.get(stop.stop_id)?.get(mode)?.entries() || [])].map(([line,isNight]) => ({ line, isNight })));
      const nightLines = lineEntries.filter(item => item.isNight).map(item => item.line).filter(Boolean);
      const dayLines = lineEntries.filter(item => !item.isNight).map(item => item.line).filter(Boolean);
      const hasNightService = lineEntries.some(item => item.isNight), hasDayService = lineEntries.some(item => !item.isNight);
      if (modes.length) add(stop, { kind:'surface', modes, boardable:true, hasNightService, hasDayService, nightOnly:hasNightService && !hasDayService, nightLines:[...new Set(nightLines)], dayLines:[...new Set(dayLines)] });
    }
  }

  for (const station of stops.filter(stop => Number(stop.location_type || 0) === 1)) {
    const kids = children.get(station.stop_id) || [];
    const metroStops = kids.filter(stop => Number(stop.location_type || 0) === 0 && usage.get(stop.stop_id)?.has(1));
    if (metroStops.length) {
      const departureStopIds = metroStops.map(stop => stop.stop_id).sort();
      const lines = [...new Set(metroStops.flatMap(stop => [...usage.get(stop.stop_id).get(1).keys()]).filter(Boolean))].sort();
      const entrances = kids.filter(stop => Number(stop.location_type || 0) === 2 && Number.isFinite(Number(stop.stop_lat)));
      for (const entrance of entrances) add(entrance, { kind:'metro_entrance', name:station.stop_name, entranceId:entrance.stop_id, entranceLabel:entrance.stop_name === station.stop_name ? (entrance.stop_id.match(/E[^E]*$/)?.[0] || entrance.stop_code || '') : entrance.stop_name, stationId:station.stop_id, departureStopIds, lines, modes:[1] });
      if (!entrances.length) add(station, { kind:'metro_station', stationId:station.stop_id, departureStopIds, lines, modes:[1] });
    } else {
      const railStops = kids.filter(stop => usage.get(stop.stop_id)?.has(2) && passengerRailStops.has(stop.stop_id));
      if (railStops.length) add(station, { kind:'train_station', stationId:station.stop_id, departureStopIds:railStops.map(stop => stop.stop_id).sort(), modes:[2] });
    }
  }

  return { markers: markers.sort((a,b) => a.id.localeCompare(b.id)), statistics };
}

export function buildMarkers(input) {
  return buildMarkersWithStats(input).markers;
}
