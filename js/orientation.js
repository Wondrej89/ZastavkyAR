const wrappedDelta = (target, current) => ((target-current+540)%360)-180;
const normalize = value => (value%360+360)%360;

export function circularMean(values) {
  if (!values.length) return null;
  const sum=values.reduce((out,value)=>({x:out.x+Math.cos(value*Math.PI/180),y:out.y+Math.sin(value*Math.PI/180)}),{x:0,y:0});
  return normalize(Math.atan2(sum.y,sum.x)*180/Math.PI);
}

/**
 * Keeps fast phone rotation independent from the noisy magnetic north reading.
 * The compass establishes north once, then only removes long-term relative-sensor
 * drift. DeviceOrientation is the best broadly available fallback until the
 * experimental WebXR path is enabled.
 */
export class OrientationController {
  constructor(onHeading,onWarning=()=>{},config={},now=()=>Date.now()) {
    this.onHeading=onHeading;this.onWarning=onWarning;this.now=now;
    this.config={headingPublishIntervalMs:100,headingStabilizationMs:1000,headingInitializationSpreadDeg:8,headingDeadbandDeg:2.5,compassCorrectionAlpha:.025,compassCorrectionMaxDegPerSecond:3,compassMaxErrorDeg:45,orientationAbsoluteWaitMs:1000,...config};
    this.heading=null;this.relativeHeading=null;this.compassHeading=null;this.compassCorrection=0;this.startedAt=null;this.lastPublishedAt=-Infinity;this.lastFusionAt=null;this.lastRelativeRaw=null;this.compassSamples=[];this.relativeCandidate=null;this.hasRelativeEvents=false;this.handler=this.handle.bind(this);
  }
  async start() {
    if (typeof DeviceOrientationEvent === 'undefined') throw new Error('Orientace není podporována');
    if (typeof DeviceOrientationEvent.requestPermission === 'function' && await DeviceOrientationEvent.requestPermission() !== 'granted') throw new Error('Orientace nebyla povolena');
    this.startedAt=this.now();
    window.addEventListener('deviceorientationabsolute',this.handler,true);
    window.addEventListener('deviceorientation',this.handler,true);
  }
  handle(event) {
    const now=this.now(),ios=Number.isFinite(event.webkitCompassHeading),absolute=ios||event.absolute===true||event.type==='deviceorientationabsolute';
    if(ios&&Number.isFinite(event.webkitCompassAccuracy)&&event.webkitCompassAccuracy>this.config.compassMaxErrorDeg){this.onWarning('Kompas potřebuje kalibraci.');return}
    const rawRelative=this.eventHeading(event);
    if(!absolute)this.hasRelativeEvents=true;
    // Once genuine relative events arrive, absolute events only feed correction.
    const useForMotion=Number.isFinite(rawRelative)&&(!this.hasRelativeEvents||!absolute);
    const compass=absolute?(ios?normalize(event.webkitCompassHeading+(this.screenAngle())):rawRelative):null;
    if(Number.isFinite(compass))this.addCompassSample(compass,now);
    else if(this.heading===null&&Number.isFinite(rawRelative)){this.relativeCandidate={heading:rawRelative,time:now};this.initializeRelativeFallback(now)}
    if(this.heading!==null&&useForMotion)this.integrateRelative(rawRelative,now);
    if(this.heading!==null&&Number.isFinite(this.compassHeading))this.correctCompass(now);
    this.publish(now);
  }
  eventHeading(event){if(!Number.isFinite(event.alpha))return null;return normalize(360-event.alpha+this.screenAngle())}
  screenAngle(){return Number(globalThis.screen?.orientation?.angle??globalThis.orientation??0)||0}
  addCompassSample(value,now){
    this.compassSamples.push({value,time:now});this.compassSamples=this.compassSamples.filter(sample=>now-sample.time<=this.config.headingStabilizationMs);
    this.compassHeading=circularMean(this.compassSamples.map(sample=>sample.value));
    const minimumSamples=this.config.headingStabilizationMs>0?2:1;
    if(this.heading!==null||this.compassSamples.length<minimumSamples)return;
    const duration=now-this.compassSamples[0].time,spread=Math.max(...this.compassSamples.map(sample=>Math.abs(wrappedDelta(sample.value,this.compassHeading))));
    if(duration>=this.config.headingStabilizationMs&&spread<=this.config.headingInitializationSpreadDeg){this.heading=this.compassHeading;this.relativeHeading=this.heading;this.lastRelativeRaw=null;this.lastFusionAt=now}
  }
  initializeRelativeFallback(now){
    // Some browsers expose no absolute event. Preserve the standard sensor mode
    // after the normal wait, while reporting that no compass correction exists.
    if(this.startedAt===null)this.startedAt=now;
    if(now-this.startedAt<this.config.orientationAbsoluteWaitMs+this.config.headingStabilizationMs)return;
    this.heading=this.relativeCandidate.heading;this.relativeHeading=this.heading;this.lastRelativeRaw=this.relativeCandidate.heading;this.lastFusionAt=now;
  }
  integrateRelative(raw,now){
    if(this.lastRelativeRaw!==null){const delta=wrappedDelta(raw,this.lastRelativeRaw);this.relativeHeading=normalize(this.relativeHeading+delta);this.heading=normalize(this.heading+delta)}
    this.lastRelativeRaw=raw;if(this.lastFusionAt===null)this.lastFusionAt=now;
  }
  correctCompass(now){
    const elapsed=Math.max(0,(now-(this.lastFusionAt??now))/1000);this.lastFusionAt=now;
    const error=wrappedDelta(this.compassHeading,this.heading);
    if(Math.abs(error)<=this.config.headingDeadbandDeg){this.compassCorrection=0;return}
    const wanted=error*this.config.compassCorrectionAlpha,maxStep=this.config.compassCorrectionMaxDegPerSecond*elapsed;
    this.compassCorrection=Math.sign(wanted)*Math.min(Math.abs(wanted),maxStep);this.heading=normalize(this.heading+this.compassCorrection);
  }
  publish(now){if(this.heading===null||now-this.lastPublishedAt<this.config.headingPublishIntervalMs)return;this.lastPublishedAt=now;this.onHeading(this.heading,this.debugState())}
  debugState(){return{compassHeading:this.compassHeading,relativeHeading:this.relativeHeading,fusedHeading:this.heading,compassCorrection:this.compassCorrection}}
  stop(){window.removeEventListener('deviceorientationabsolute',this.handler,true);window.removeEventListener('deviceorientation',this.handler,true)}
}
