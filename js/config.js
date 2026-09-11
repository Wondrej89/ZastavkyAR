export const CONFIG = Object.freeze({
  apiBaseUrl: '',
  datasetUrl: './data/pid-stops.json',
  datasetMetaUrl: './data/pid-stops-meta.json',
  nearbyRadiusMeters: 300,
  gridCellDegrees: 0.005,
  horizontalFovDeg: 60,
  selectionAngleDeg: 8,
  selectionDwellMs: 800,
  selectionLockMs: 1400,
  realtimeRefreshMs: 20000,
  lowAccuracyMeters: 80,
  maxMarkers: 24,
  debugPosition: { latitude: 50.0715, longitude: 14.4039, accuracy: 8 }
});
