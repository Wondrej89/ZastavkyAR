const R = 6371000;
const rad = value => value * Math.PI / 180;
export function haversine(a, b) {
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
export function bearing(a, b) {
  const dLon = rad(b.longitude - a.longitude), lat1 = rad(a.latitude), lat2 = rad(b.latitude);
  return (Math.atan2(Math.sin(dLon) * Math.cos(lat2), Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)) * 180 / Math.PI + 360) % 360;
}
export function angleDifference(target, heading) { return ((target - heading + 540) % 360) - 180; }
export const gridKey = (lat, lon, size) => `${Math.floor(lat / size)}:${Math.floor(lon / size)}`;
export function buildGrid(stops, size) {
  const grid = new Map();
  for (const stop of stops) { const key = gridKey(stop.lat, stop.lon, size); if (!grid.has(key)) grid.set(key, []); grid.get(key).push(stop); }
  return grid;
}
export function nearbyFromGrid(grid, position, radius, size) {
  const latCell = Math.floor(position.latitude / size), lonCell = Math.floor(position.longitude / size);
  const span = Math.max(1, Math.ceil(radius / (size * 111320)) + 1), found = [];
  for (let y = -span; y <= span; y++) for (let x = -span; x <= span; x++) {
    for (const stop of grid.get(`${latCell + y}:${lonCell + x}`) || []) {
      const distance = haversine(position, { latitude: stop.lat, longitude: stop.lon });
      if (distance <= radius) found.push({ ...stop, distance, bearing: bearing(position, { latitude: stop.lat, longitude: stop.lon }) });
    }
  }
  return found.sort((a, b) => a.distance - b.distance);
}
