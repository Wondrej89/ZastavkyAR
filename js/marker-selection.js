/**
 * Updates the marker targeted by the reticle without activating it.
 *
 * Keeping aiming and activation separate is intentional: looking at a marker
 * may change its visual state, but opening departures always requires an
 * explicit user interaction with the marker.
 */
export function aimMarker(state, stop) {
  state.aimed = stop;
}
