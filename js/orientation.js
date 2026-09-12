const wrappedDelta = (target, current) => ((target-current+540)%360)-180;

export function circularMean(values) {
  if (!values.length) return null;
  const sum=values.reduce((out,value)=>({x:out.x+Math.cos(value*Math.PI/180),y:out.y+Math.sin(value*Math.PI/180)}),{x:0,y:0});
  return (Math.atan2(sum.y,sum.x)*180/Math.PI+360)%360;
}

export class OrientationController {
  constructor(onHeading,onWarning=()=>{},config={},now=()=>Date.now()) {
    this.onHeading=onHeading;this.onWarning=onWarning;this.now=now;
    this.config={headingPublishIntervalMs:100,headingBufferSize:10,headingStabilizationMs:800,headingDeadbandDeg:2.5,headingSmallDeltaDeg:5,headingTurnDeltaDeg:12,headingSmallAlpha:.08,headingMediumAlpha:.15,headingTurnAlpha:.35,compassMaxErrorDeg:45,orientationAbsoluteWaitMs:1000,...config};
    this.heading=null;this.source=null;this.startedAt=null;this.lastPublishedAt=-Infinity;this.buffer=[];this.relativeCandidate=null;this.handler=this.handle.bind(this);
  }
  async start() {
    if (typeof DeviceOrientationEvent === 'undefined') throw new Error('Orientace není podporována');
    if (typeof DeviceOrientationEvent.requestPermission === 'function' && await DeviceOrientationEvent.requestPermission() !== 'granted') throw new Error('Orientace nebyla povolena');
    this.startedAt=this.now();
    window.addEventListener('deviceorientationabsolute', this.handler, true);
    window.addEventListener('deviceorientation', this.handler, true);
    this.fallbackTimer=setTimeout(()=>{if(!this.source&&this.relativeCandidate){this.source='relative';this.consume(this.relativeCandidate)}},this.config.orientationAbsoluteWaitMs);
  }
  handle(event) {
    const ios=Number.isFinite(event.webkitCompassHeading), isAbsolute=ios||event.absolute===true||event.type==='deviceorientationabsolute', source=ios?'ios':isAbsolute?'absolute':'relative';
    if(this.source&&source!==this.source)return;
    if(!this.source&&source==='relative'){
      this.relativeCandidate=event;
      if(this.startedAt!==null&&this.now()-this.startedAt<this.config.orientationAbsoluteWaitMs)return;
    }
    if(!this.source){this.source=source;clearTimeout(this.fallbackTimer)}
    if(ios&&Number.isFinite(event.webkitCompassAccuracy)&&event.webkitCompassAccuracy>this.config.compassMaxErrorDeg){this.onWarning('Kompas potřebuje kalibraci.');return}
    this.consume(event);
  }
  consume(event) {
    let raw=event.webkitCompassHeading;if(!Number.isFinite(raw)&&Number.isFinite(event.alpha))raw=(360-event.alpha)%360;if(!Number.isFinite(raw))return;
    const angle=globalThis.screen?.orientation?.angle??globalThis.orientation??0;raw=(raw+Number(angle||0)+360)%360;
    this.buffer.push(raw);this.buffer=this.buffer.slice(-this.config.headingBufferSize);
    const now=this.now();if(this.startedAt===null)this.startedAt=now;
    if(now-this.startedAt<this.config.headingStabilizationMs||now-this.lastPublishedAt<this.config.headingPublishIntervalMs)return;
    const target=circularMean(this.buffer);
    if(this.heading===null)this.heading=target;
    else {const delta=wrappedDelta(target,this.heading),magnitude=Math.abs(delta);if(magnitude<this.config.headingDeadbandDeg)return;const alpha=magnitude<this.config.headingSmallDeltaDeg?this.config.headingSmallAlpha:magnitude<=this.config.headingTurnDeltaDeg?this.config.headingMediumAlpha:this.config.headingTurnAlpha;this.heading=(this.heading+delta*alpha+360)%360}
    this.lastPublishedAt=now;this.onHeading(this.heading);
  }
  stop() { clearTimeout(this.fallbackTimer);window.removeEventListener('deviceorientationabsolute',this.handler,true);window.removeEventListener('deviceorientation',this.handler,true); }
}
