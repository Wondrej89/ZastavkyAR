import test from 'node:test';
import assert from 'node:assert/strict';
import { collisionLayout, markerPresentation } from '../js/markers.js';
import { markerHasNightIndicator } from '../js/transit.js';
import { CONFIG } from '../js/config.js';

test('near marker has absolute layout and hit-testing priority over a far marker',()=>{
  const [near,far]=markerPresentation([{id:'far',distance:180},{id:'near',distance:40}],CONFIG.nearStopPriorityDistanceM);
  assert.equal(near.id,'near');
  assert.equal(near.priority,0);
  assert.ok(near.zIndex>far.zIndex);
});

test('far marker is half opaque when a visible near marker exists',()=>{
  const markers=markerPresentation([{id:'near',distance:100},{id:'far',distance:101}],CONFIG.nearStopPriorityDistanceM);
  assert.equal(markers.find(marker=>marker.id==='far').opacity,.5);
});

test('far markers retain normal opacity when no visible near marker exists',()=>{
  const markers=markerPresentation([{id:'far-a',distance:101},{id:'far-b',distance:220}],CONFIG.nearStopPriorityDistanceM);
  assert.ok(markers.every(marker=>marker.opacity===1));
});

test('collision layout separates several dense near marker DOM boxes',()=>{
  const markers=markerPresentation(Array.from({length:6},(_,index)=>({id:String(index),distance:10+index,x:50,width:160,height:60})),CONFIG.nearStopPriorityDistanceM);
  const laid=collisionLayout(markers,{viewportWidth:360,minGap:10});
  for(let i=0;i<laid.length;i++)for(let j=i+1;j<laid.length;j++){
    const a=laid[i],b=laid[j];
    const separatedX=Math.abs(a.screenX-b.screenX)>=(a.width+b.width)/2+10;
    const separatedY=Math.abs(a.offset-b.offset)>=(a.height+b.height)/2+10;
    assert.ok(separatedX||separatedY,`${a.id} and ${b.id} overlap`);
  }
  assert.equal(laid[0].offset,0);
});

test('night-stop daytime filter only changes AR marker indication during the day',()=>{
  const marker={modes:[0],hasNightService:true,hasDayService:false,nightOnly:true,nightLines:['93'],dayLines:[]};
  const day=new Date('2026-01-15T14:00:00+01:00'),night=new Date('2026-01-15T00:30:00+01:00');
  assert.equal(markerHasNightIndicator(marker,day,CONFIG,false),false);
  assert.equal(markerHasNightIndicator(marker,day,CONFIG,true),true);
  assert.equal(markerHasNightIndicator(marker,night,CONFIG,false),true);
});
