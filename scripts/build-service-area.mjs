#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const stopBufferMeters = 3000;
export const outerSafetyBufferMeters = 2000;
export const simplifyToleranceMeters = 300;

const cellMeters = 250;
const earthRadius = 6371008.8;

const key = (x, y) => `${x},${y}`;
const parseKey = value => value.split(',').map(Number);
const distanceToSegment = (p, a, b) => {
  const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;
  const t=den?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)):0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
};
function simplify(points,tolerance) {
  if(points.length<=4)return points;
  const open=points.slice(0,-1);let start=0;for(let i=1;i<open.length;i++)if(open[i][0]<open[start][0])start=i;
  const rotated=[...open.slice(start),...open.slice(0,start)],line=[...rotated,rotated[0]];
  function dp(values){if(values.length<=2)return values;let max=0,index=0;for(let i=1;i<values.length-1;i++){const d=distanceToSegment(values[i],values[0],values.at(-1));if(d>max){max=d;index=i}}if(max<=tolerance)return[values[0],values.at(-1)];const left=dp(values.slice(0,index+1)),right=dp(values.slice(index));return[...left.slice(0,-1),...right]}
  // Split the closed ring in two, otherwise identical endpoints make Douglas-Peucker degenerate.
  const middle=Math.floor(line.length/2),result=[...dp(line.slice(0,middle+1)).slice(0,-1),...dp(line.slice(middle))];
  return result.length>=4?result:points;
}
const ringArea=ring=>ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1]},0)/2;
const inRing=(point,ring)=>{let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside}return inside};

/** Builds an approximate metric union on a 250 m grid, avoiding a hull across remote PID branches. */
export function buildServiceArea(markers,{generatedAt=new Date().toISOString()}={}) {
  const unique=[...new Map(markers.filter(m=>Number.isFinite(m.lat)&&Number.isFinite(m.lon)&&m.physical!==false).map(m=>[`${m.lat.toFixed(6)},${m.lon.toFixed(6)}`,m])).values()];
  if(!unique.length)return feature([],generatedAt);
  const originLat=unique.reduce((s,m)=>s+m.lat,0)/unique.length*Math.PI/180;
  const project=([lon,lat])=>[earthRadius*lon*Math.PI/180*Math.cos(originLat),earthRadius*lat*Math.PI/180];
  const unproject=([x,y])=>[x/earthRadius/Math.cos(originLat)*180/Math.PI,y/earthRadius*180/Math.PI];
  const stops=unique.map(m=>project([m.lon,m.lat]));
  const occupied=new Set(),paint=(target,[cx,cy],radius)=>{const minX=Math.floor((cx-radius)/cellMeters),maxX=Math.floor((cx+radius)/cellMeters),minY=Math.floor((cy-radius)/cellMeters),maxY=Math.floor((cy+radius)/cellMeters);for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++)if(Math.hypot((x+.5)*cellMeters-cx,(y+.5)*cellMeters-cy)<=radius+cellMeters*Math.SQRT2/2)target.add(key(x,y))};
  for(const point of stops)paint(occupied,point,stopBufferMeters);
  const expanded=new Set(occupied),steps=Math.ceil(outerSafetyBufferMeters/cellMeters);
  for(const value of occupied){const [x,y]=parseKey(value);for(let dx=-steps;dx<=steps;dx++)for(let dy=-steps;dy<=steps;dy++)if(Math.hypot(dx,dy)*cellMeters<=outerSafetyBufferMeters+cellMeters*Math.SQRT2)expanded.add(key(x+dx,y+dy))}
  const edges=new Map(),addEdge=(a,b)=>{const reverse=`${b}>${a}`,forward=`${a}>${b}`;if(edges.has(reverse))edges.delete(reverse);else edges.set(forward,[a,b])};
  for(const value of expanded){const [x,y]=parseKey(value);addEdge(key(x,y),key(x+1,y));addEdge(key(x+1,y),key(x+1,y+1));addEdge(key(x+1,y+1),key(x,y+1));addEdge(key(x,y+1),key(x,y))}
  const from=new Map();for(const edge of edges.values()){if(!from.has(edge[0]))from.set(edge[0],[]);from.get(edge[0]).push(edge)}
  const rings=[];while(edges.size){const first=edges.values().next().value,ring=[],start=first[0];let current=first;do{ring.push(parseKey(current[0]).map(v=>v*cellMeters));edges.delete(`${current[0]}>${current[1]}`);const choices=(from.get(current[1])||[]).filter(e=>edges.has(`${e[0]}>${e[1]}`));current=choices[0]}while(current&&current[0]!==start);ring.push(ring[0]);rings.push(simplify(ring,simplifyToleranceMeters))}
  const outer=rings.filter(r=>ringArea(r)>0),holes=rings.filter(r=>ringArea(r)<0&&Math.abs(ringArea(r))>=4_000_000);
  const polygons=outer.map(r=>[r]);for(const hole of holes){const index=outer.findIndex(r=>inRing(hole[0],r));if(index>=0)polygons[index].push(hole)}
  return feature(polygons.map(poly=>poly.map(r=>r.map(unproject))),generatedAt);
}
function feature(coordinates,generatedAt){return{type:'Feature',properties:{generatedAt,source:'PID GTFS passenger stops',stopBufferMeters,safetyBufferMeters:outerSafetyBufferMeters},geometry:{type:'MultiPolygon',coordinates}}}

const invoked=process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1];
if(invoked){const dataUrl=new URL('../data/pid-stops.json',import.meta.url),output=new URL('../data/pid-service-area.json',import.meta.url),preview=new URL('../data/pid-service-area-preview.geojson',import.meta.url);const data=JSON.parse(await readFile(dataUrl,'utf8'));const area=buildServiceArea(data.stops,{generatedAt:data.generatedAt});const json=JSON.stringify(area,null,2)+'\n';await Promise.all([writeFile(output,json),writeFile(preview,json)]);console.log(`Vytvořena PID geofence z ${data.stops.length} veřejných markerů (${area.geometry.coordinates.length} částí).`)}
