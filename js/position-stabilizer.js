import { haversine } from './geo.js';

export class PositionStabilizer {
  constructor(config,onPosition,now=()=>Date.now(),onHardReanchor=()=>{}){
    this.config=config;this.onPosition=onPosition;this.now=now;this.onHardReanchor=onHardReanchor;this.hardReanchorCount=0;this.lastHardReanchorReason=null;this.reset();
  }
  reset(){this.started=this.now();this.samples=[];this.pending=[];this.largePending=[];this.anchor=null;this.anchorSource=null;this.lastUpdate=-Infinity;this.lastRawPositionAt=null;this.lastAcceptedPositionAt=null;this.anchorStale=false}
  markAnchorStale(){this.anchorStale=true;this.pending=[];this.largePending=[]}
  reanchor(fix,reason='manual'){
    this.samples=[];this.pending=[];this.largePending=[];this.anchorStale=false;this.hardReanchorCount++;this.lastHardReanchorReason=reason;this.publish({...fix},true,reason);this.onHardReanchor(this.anchor,reason);return 'reanchored';
  }
  seedFromFix(fix,reason='manual'){return this.reanchor(fix,reason)}
  add(fix,{resume=false}={}){
    if(!Number.isFinite(fix.latitude)||!Number.isFinite(fix.longitude)||!Number.isFinite(fix.accuracy))return 'invalid';
    const receivedAt=this.now(),timestamp=Number.isFinite(fix.timestamp)?fix.timestamp:receivedAt,fresh=receivedAt-timestamp<=this.config.gpsFreshFixMaxAgeMs,qualityFix=fix.accuracy<=this.config.gpsHardReanchorMaxAccuracyMeters,moving=Number.isFinite(fix.speed)&&fix.speed>=this.config.gpsVehicleSpeedMps;
    this.lastRawPositionAt=receivedAt;this.movementMode=moving?'moving':'static';
    this.samples.push(fix);this.samples=this.samples.slice(-this.config.gpsSampleCount);
    const quality=this.samples.filter(s=>s.accuracy<=this.config.gpsSampleMaxAccuracy);
    if(!this.anchor){
      const candidates=quality.slice(-this.config.gpsAnchorSampleCount),timedOut=receivedAt-this.started>=this.config.gpsStartupTimeoutMs;
      if(!timedOut&&(fix.accuracy>this.config.gpsAnchorAccuracyMeters||candidates.length<this.config.gpsAnchorSampleCount))return 'pending';
      const stable=candidates.length&&candidates.every(sample=>haversine(candidates[0],sample)<=this.config.gpsAnchorSpreadMeters);
      if(!timedOut&&!stable)return 'pending';
      this.publish(this.average(stable?candidates:(quality.length?quality:[fix])),false,'startup');return 'accepted';
    }
    const distance=haversine(this.anchor,fix),improved=fix.accuracy<=this.anchor.accuracy*this.config.gpsAccuracyImprovementRatio;
    if((resume||this.anchorStale)&&fresh&&qualityFix)return this.reanchor(fix,'resume-after-background');
    if(fresh&&qualityFix&&distance>this.config.gpsHardReanchorMeters){
      this.largePending.push(fix);this.largePending=this.largePending.filter(sample=>haversine(this.anchor,sample)>this.config.gpsHardReanchorMeters).slice(-2);
      const consistent=this.largePending.length===2&&haversine(this.largePending[0],this.largePending[1])<=this.config.gpsHardReanchorMeters;
      if(consistent)return this.reanchor(fix,moving?'vehicle-movement':'large-displacement');
      return 'pending';
    }
    this.largePending=[];
    // Sensor speed distinguishes real continuous travel from stationary scatter.
    if(moving){this.pending.push(fix);this.pending=this.pending.slice(-this.config.gpsMoveConfirmationCount);if(distance<this.config.gpsMoveThresholdMeters)return 'pending';if(receivedAt-this.lastUpdate<this.config.gpsAnchorMinIntervalMs)return 'pending';this.pending=[];this.publish(qualityFix?fix:this.average([fix]),false,'gps');return 'accepted'}
    if(Number.isFinite(fix.speed)&&fix.speed<this.config.gpsStaticSpeedMps&&!improved){this.pending=[];return 'ignored'}
    if(distance<this.config.gpsMoveThresholdMeters){this.pending=[];if(!improved||distance<this.config.gpsDeadbandMeters)return 'ignored';this.updateToward(this.average([fix]));return 'accepted'}
    if(this.pending.length&&haversine(this.pending[this.pending.length-1],fix)>this.config.gpsMoveConsistencyMeters)this.pending=[];
    this.pending.push(fix);this.pending=this.pending.slice(-this.config.gpsMoveConfirmationCount);
    if(this.pending.length<this.config.gpsMoveConfirmationCount)return 'pending';
    const target=this.average(this.pending);this.pending=[];this.updateToward(target);return 'accepted';
  }
  updateToward(target){if(this.now()-this.lastUpdate<this.config.gpsAnchorMinIntervalMs)return;const alpha=this.config.gpsInterpolationAlpha;this.publish({...target,latitude:this.anchor.latitude+(target.latitude-this.anchor.latitude)*alpha,longitude:this.anchor.longitude+(target.longitude-this.anchor.longitude)*alpha},false,'gps')}
  publish(position,force=false,source='gps'){if(!force&&this.now()-this.lastUpdate<this.config.gpsAnchorMinIntervalMs)return;this.anchor=position;this.anchorSource=source==='startup'?'startup':source==='map-to-ar'?'map-to-ar':source==='resume-after-background'?'resume':'gps';this.lastUpdate=this.now();this.lastAcceptedPositionAt=this.lastUpdate;this.onPosition(this.anchor)}
  diagnostics(){return{lastRawPositionAt:this.lastRawPositionAt,lastAcceptedPositionAt:this.lastAcceptedPositionAt,anchorSource:this.anchorSource||null,movementMode:this.movementMode||'static',hardReanchorCount:this.hardReanchorCount,lastHardReanchorReason:this.lastHardReanchorReason,anchorStale:this.anchorStale}}
  average(samples){let total=0,latitude=0,longitude=0,speedTotal=0,speedWeight=0;for(const s of samples){const weight=1/Math.max(1,s.accuracy)**2;total+=weight;latitude+=s.latitude*weight;longitude+=s.longitude*weight;if(Number.isFinite(s.speed)){speedTotal+=s.speed*weight;speedWeight+=weight}}return{latitude:latitude/total,longitude:longitude/total,accuracy:Math.min(...samples.map(s=>s.accuracy)),timestamp:Math.max(...samples.map(s=>s.timestamp||0)),speed:speedWeight?speedTotal/speedWeight:null}}
}
