import { haversine } from './geo.js';

export class PositionStabilizer {
  constructor(config, onPosition, now = () => Date.now()) { this.config=config; this.onPosition=onPosition; this.now=now; this.started=now(); this.samples=[]; this.anchor=null; }
  add(fix) {
    if (!Number.isFinite(fix.latitude)||!Number.isFinite(fix.longitude)||!Number.isFinite(fix.accuracy)) return;
    this.samples.push(fix); this.samples=this.samples.slice(-this.config.gpsSampleCount);
    const quality=this.samples.filter(s=>s.accuracy<=this.config.gpsSampleMaxAccuracy).sort((a,b)=>a.accuracy-b.accuracy).slice(0,this.config.gpsSampleCount);
    if (!this.anchor) {
      if (fix.accuracy>this.config.gpsAnchorAccuracyMeters && this.now()-this.started<this.config.gpsStartupTimeoutMs) return;
      this.anchor=this.average(quality.length?quality:[fix]); this.onPosition(this.anchor); return;
    }
    const distance=haversine(this.anchor,fix), improved=fix.accuracy<=this.anchor.accuracy*this.config.gpsAccuracyImprovementRatio;
    if (distance<this.config.gpsDeadbandMeters&&!improved) return;
    if (distance<this.config.gpsMoveThresholdMeters&&!improved) return;
    const target=this.average(quality.length?quality:[fix]), alpha=this.config.gpsInterpolationAlpha;
    this.anchor={...target,latitude:this.anchor.latitude+(target.latitude-this.anchor.latitude)*alpha,longitude:this.anchor.longitude+(target.longitude-this.anchor.longitude)*alpha};
    this.onPosition(this.anchor);
  }
  average(samples) { let total=0,latitude=0,longitude=0;for(const s of samples){const weight=1/Math.max(1,s.accuracy)**2;total+=weight;latitude+=s.latitude*weight;longitude+=s.longitude*weight}return{latitude:latitude/total,longitude:longitude/total,accuracy:Math.min(...samples.map(s=>s.accuracy)),timestamp:Math.max(...samples.map(s=>s.timestamp||0))}; }
}
