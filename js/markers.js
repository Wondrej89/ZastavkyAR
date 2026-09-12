export const ALL_MODES = [0,1,2,3,4,7,11];
export function markerModes(marker) { return marker.kind==='metro_entrance'||marker.kind==='metro_station'?[1]:marker.kind==='train_station'?[2]:(marker.modes||[]); }
export function filterMarkers(markers, enabled) { return markers.filter(marker=>markerModes(marker).some(mode=>enabled.has(mode))); }
export function collisionLayout(markers, minGap=76) {
  const placed=[];
  for(const marker of [...markers].sort((a,b)=>a.distance-b.distance)){let offset=0;const conflicts=placed.filter(p=>Math.abs(p.x-marker.x)<18&&Math.abs(p.offset-offset)<minGap);if(conflicts.length){const n=conflicts.length;offset=(Math.ceil(n/2)*minGap)*(n%2? -1:1)}placed.push({...marker,offset});}
  return placed;
}
