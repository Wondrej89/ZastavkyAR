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
    this.config={headingPublishIntervalMs:100,headingBufferSize:10,headingStabilizationMs:1000,headingInitializationSpreadDeg:8,headingDeadbandDeg:2.5,compassCorrectionAlpha:.025,compassCorrectionMaxDegPerSecond:3,compassMaxErrorDeg:45,orientationStartupFallbackMs:2000,...config};
    this.heading=null;this.relativeHeading=null;this.compassHeading=null;this.compassCorrection=0;this.initializationStartedAt=null;this.lastPublishedAt=-Infinity;this.lastFusionAt=null;this.lastRelativeRaw=null;this.compassSamples=[];this.relativeCandidate=null;this.hasRelativeEvents=false;this.spreadWarningShown=false;this.relativeWarningShown=false;this.accuracyWarningShown=false;this.handler=this.handle.bind(this);
  }
  async start() {
    if (typeof DeviceOrientationEvent === 'undefined') throw new Error('Orientace není podporována');
    if (typeof DeviceOrientationEvent.requestPermission === 'function' && await DeviceOrientationEvent.requestPermission() !== 'granted') throw new Error('Orientace nebyla povolena');
    this.initializationStartedAt=this.now();
    window.addEventListener('deviceorientationabsolute',this.handler,true);
    window.addEventListener('deviceorientation',this.handler,true);
  }
  handle(event) {
    const now=this.now(),ios=Number.isFinite(event.webkitCompassHeading),absolute=ios||event.absolute===true||event.type==='deviceorientationabsolute';
    if(this.initializationStartedAt===null)this.initializationStartedAt=now;
    const inaccurateIosCompass=ios&&Number.isFinite(event.webkitCompassAccuracy)&&event.webkitCompassAccuracy>this.config.compassMaxErrorDeg;
    if(inaccurateIosCompass&&!this.accuracyWarningShown){this.accuracyWarningShown=true;this.onWarning('Kompas potřebuje kalibraci.')}
    const rawRelative=this.eventHeading(event);
    if(!absolute)this.hasRelativeEvents=true;
    // Once genuine relative events arrive, absolute events only feed correction.
    const useForMotion=Number.isFinite(rawRelative)&&(ios||!this.hasRelativeEvents||!absolute);
    // iOS's webkit value is the absolute north reference; alpha remains useful
    // as the fast relative rotation sensor, even when compass accuracy is poor.
    const compass=absolute&&!inaccurateIosCompass?(ios?normalize(event.webkitCompassHeading+this.screenAngle()):rawRelative):null;
    if(Number.isFinite(compass))this.addCompassSample(compass,now);
    if(this.heading===null&&Number.isFinite(rawRelative)){this.relativeCandidate={heading:rawRelative,time:now};this.initializeRelativeFallback(now)}
    if(this.heading!==null&&useForMotion)this.integrateRelative(rawRelative,now);
    if(this.heading!==null&&Number.isFinite(this.compassHeading))this.correctCompass(now);
    this.publish(now);
  }
  eventHeading(event){if(!Number.isFinite(event.alpha))return null;return normalize(360-event.alpha+this.screenAngle())}
  screenAngle(){return Number(globalThis.screen?.orientation?.angle??globalThis.orientation??0)||0}
  addCompassSample(value,now){
    this.compassSamples.push({value,time:now});this.compassSamples=this.compassSamples.slice(-this.config.headingBufferSize);
    this.compassHeading=circularMean(this.compassSamples.map(sample=>sample.value));
    if(this.heading!==null||this.compassSamples.length<3||now-this.initializationStartedAt<this.config.headingStabilizationMs)return;
    const spread=Math.max(...this.compassSamples.map(sample=>Math.abs(wrappedDelta(sample.value,this.compassHeading))));
    if(spread>this.config.headingInitializationSpreadDeg&&!this.spreadWarningShown){this.spreadWarningShown=true;this.onWarning('Kompas je méně přesný, zkuste telefon krátce pohnout do tvaru osmičky.')}
    this.heading=this.compassHeading;this.relativeHeading=this.heading;this.lastRelativeRaw=null;this.lastFusionAt=now;
  }
  initializeRelativeFallback(now){
    // Some browsers expose no absolute event. Preserve the standard sensor mode
    // after the normal wait, while reporting that no compass correction exists.
    if(this.initializationStartedAt===null)this.initializationStartedAt=now;
    if(now-this.initializationStartedAt<this.config.orientationStartupFallbackMs)return;
    this.heading=this.relativeCandidate.heading;this.relativeHeading=this.heading;this.lastRelativeRaw=this.relativeCandidate.heading;this.lastFusionAt=now;
    if(!this.relativeWarningShown){this.relativeWarningShown=true;this.onWarning('Směr není přesně zkalibrován.')}
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
