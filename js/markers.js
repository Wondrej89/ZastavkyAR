export const ALL_MODES = [0,1,2,3,4,7,11];
export function markerModes(marker) { return marker.kind==='metro_entrance'||marker.kind==='metro_station'?[1]:marker.kind==='train_station'?[2]:(marker.modes||[]); }
const ACCESSIBLE_MODE_NAMES = new Map([[0,'tramvajová zastávka'],[1,'stanice metra'],[2,'železniční stanice'],[3,'autobusová zastávka'],[4,'přístaviště přívozu'],[7,'stanice lanovky'],[11,'trolejbusová zastávka']]);

function joinCzech(items) {
  if(items.length<2)return items[0]||'';
  return `${items.slice(0,-1).join(', ')} a ${items.at(-1)}`;
}

export function markerAriaLabel(marker, showNight=false) {
  const modes=markerModes(marker),isMetro=modes.length===1&&modes[0]===1;
  const type=modes.length===1?ACCESSIBLE_MODE_NAMES.get(modes[0]):'zastávka';
  const details=isMetro&&marker.lines?.length?`, linky ${joinCzech(marker.lines)}`:marker.platform?`, stanoviště ${marker.platform}`:'';
  return `${type}${showNight?', noční provoz':''} ${marker.name}${details}`;
}
export function filterMarkers(markers, enabled) { return markers.filter(marker=>markerModes(marker).some(mode=>enabled.has(mode))); }
export function deduplicateMetroEntrances(markers) {
  const nearest=new Map();
  for(const marker of markers)if(marker.kind==='metro_entrance'&&marker.stationId&&(!nearest.has(marker.stationId)||marker.distance<nearest.get(marker.stationId).distance))nearest.set(marker.stationId,marker);
  return markers.filter(marker=>marker.kind!=='metro_entrance'||!marker.stationId||nearest.get(marker.stationId)===marker);
}
export function markerPresentation(markers, nearDistanceM) {
  const hasVisibleNear=markers.some(marker=>marker.distance<=nearDistanceM);
  return [...markers]
    .sort((a,b)=>(a.distance<=nearDistanceM?0:1)-(b.distance<=nearDistanceM?0:1)||a.distance-b.distance)
    .map((marker,priority)=>{
      const zone=marker.distance<=nearDistanceM?'near':'far';
      return {...marker,zone,priority,opacity:zone==='far'&&hasVisibleNear?.5:1,zIndex:(zone==='near'?2000:1000)-priority};
    });
}

const overlaps=(a,b,gap)=>Math.abs(a.screenX-b.screenX)<(a.width+b.width)/2+gap&&Math.abs(a.offset-b.offset)<(a.height+b.height)/2+gap;

/** Places markers using approximate DOM bounds; input x is a percentage of viewport width. */
export function collisionLayout(markers, options={}) {
  if(typeof options==='number')options={minGap:options};
  const {minGap=8,viewportWidth=360,maxVerticalSteps=8}=options;
  const verticalSteps=Math.max(maxVerticalSteps,markers.length*2);
  const placed=[];
  const ordered=[...markers].sort((a,b)=>(a.priority??a.distance)-(b.priority??b.distance));
  for(const marker of ordered){
    const width=marker.width||176,height=marker.height||64,screenX=viewportWidth*marker.x/100;
    const verticalStep=height+minGap,horizontalStep=Math.min(width*.32,48);
    const candidates=[{offset:0,xOffset:0}];
    for(let step=1;step<=verticalSteps;step++){
      const y=Math.ceil(step/2)*verticalStep*(step%2?-1:1);
      candidates.push({offset:y,xOffset:0},{offset:y,xOffset:(step%2?-1:1)*horizontalStep});
    }
    const candidate=candidates.find(value=>!placed.some(other=>overlaps({...marker,width,height,screenX:screenX+value.xOffset,offset:value.offset},other,minGap)))||candidates.at(-1);
    placed.push({...marker,width,height,screenX:screenX+candidate.xOffset,xOffset:candidate.xOffset,offset:candidate.offset});
  }
  return placed;
}
