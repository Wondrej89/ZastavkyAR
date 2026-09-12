import { haversine } from './geo.js';

export class PositionStabilizer {
  constructor(config,onPosition,now=()=>Date.now()){this.config=config;this.onPosition=onPosition;this.now=now;this.started=now();this.samples=[];this.pending=[];this.anchor=null;this.lastUpdate=-Infinity}
  add(fix){
    if(!Number.isFinite(fix.latitude)||!Number.isFinite(fix.longitude)||!Number.isFinite(fix.accuracy))return;
    this.samples.push(fix);this.samples=this.samples.slice(-this.config.gpsSampleCount);
    const quality=this.samples.filter(s=>s.accuracy<=this.config.gpsSampleMaxAccuracy);
    if(!this.anchor){
      const candidates=quality.slice(-this.config.gpsAnchorSampleCount),timedOut=this.now()-this.started>=this.config.gpsStartupTimeoutMs;
      if(!timedOut&&(fix.accuracy>this.config.gpsAnchorAccuracyMeters||candidates.length<this.config.gpsAnchorSampleCount))return;
      const stable=candidates.length&&candidates.every(sample=>haversine(candidates[0],sample)<=this.config.gpsAnchorSpreadMeters);
      if(!timedOut&&!stable)return;
      this.publish(this.average(stable?candidates:(quality.length?quality:[fix])));return;
    }
    const distance=haversine(this.anchor,fix),improved=fix.accuracy<=this.anchor.accuracy*this.config.gpsAccuracyImprovementRatio;
    // A low sensor speed means GPS scatter, unless the new fix is materially better.
    if(Number.isFinite(fix.speed)&&fix.speed<this.config.gpsStaticSpeedMps&&!improved){this.pending=[];return}
    if(distance<this.config.gpsMoveThresholdMeters){this.pending=[];if(!improved||distance<this.config.gpsDeadbandMeters)return;return this.updateToward(this.average([fix]))}
    if(this.pending.length&&haversine(this.pending[this.pending.length-1],fix)>this.config.gpsMoveConsistencyMeters)this.pending=[];
    this.pending.push(fix);this.pending=this.pending.slice(-this.config.gpsMoveConfirmationCount);
    if(this.pending.length<this.config.gpsMoveConfirmationCount)return;
    const target=this.average(this.pending);this.pending=[];this.updateToward(target);
  }
  updateToward(target){if(this.now()-this.lastUpdate<this.config.gpsAnchorMinIntervalMs)return;const alpha=this.config.gpsInterpolationAlpha;this.publish({...target,latitude:this.anchor.latitude+(target.latitude-this.anchor.latitude)*alpha,longitude:this.anchor.longitude+(target.longitude-this.anchor.longitude)*alpha})}
  publish(position){this.anchor=position;this.lastUpdate=this.now();this.onPosition(this.anchor)}
  average(samples){let total=0,latitude=0,longitude=0,speedTotal=0,speedWeight=0;for(const s of samples){const weight=1/Math.max(1,s.accuracy)**2;total+=weight;latitude+=s.latitude*weight;longitude+=s.longitude*weight;if(Number.isFinite(s.speed)){speedTotal+=s.speed*weight;speedWeight+=weight}}return{latitude:latitude/total,longitude:longitude/total,accuracy:Math.min(...samples.map(s=>s.accuracy)),timestamp:Math.max(...samples.map(s=>s.timestamp||0)),speed:speedWeight?speedTotal/speedWeight:null}}
}
