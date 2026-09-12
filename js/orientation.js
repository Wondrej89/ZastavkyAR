export class OrientationController {
  constructor(onHeading,onWarning=()=>{},config={}) { this.onHeading=onHeading;this.onWarning=onWarning;this.config={headingSmoothingAlpha:.2,headingDeadbandDeg:1.5,compassMaxErrorDeg:45,orientationSourceLockMs:3000,...config};this.heading=null;this.source=null;this.sourceAt=0;this.handler=this.handle.bind(this); }
  async start() {
    if (typeof DeviceOrientationEvent === 'undefined') throw new Error('Orientace není podporována');
    if (typeof DeviceOrientationEvent.requestPermission === 'function' && await DeviceOrientationEvent.requestPermission() !== 'granted') throw new Error('Orientace nebyla povolena');
    window.addEventListener('deviceorientationabsolute', this.handler, true); window.addEventListener('deviceorientation', this.handler, true);
  }
  handle(event) {
    const ios=Number.isFinite(event.webkitCompassHeading), absolute=ios||event.absolute===true||event.type==='deviceorientationabsolute', source=ios?'ios':absolute?'absolute':'relative', now=Date.now();
    if(this.source&&source!==this.source&&now-this.sourceAt<this.config.orientationSourceLockMs)return;
    if(this.source==='absolute'&&source==='relative')return;if(source!==this.source){this.source=source;this.sourceAt=now}
    if(ios&&Number.isFinite(event.webkitCompassAccuracy)&&event.webkitCompassAccuracy>this.config.compassMaxErrorDeg){this.onWarning('Kompas potřebuje kalibraci.');return}
    let heading=event.webkitCompassHeading;if(!Number.isFinite(heading)&&Number.isFinite(event.alpha))heading=(360-event.alpha)%360;if(!Number.isFinite(heading))return;
    const angle=globalThis.screen?.orientation?.angle??globalThis.orientation??0;heading=(heading+Number(angle||0)+360)%360;
    if(this.heading===null)this.heading=heading;else{const delta=((heading-this.heading+540)%360)-180;if(Math.abs(delta)<this.config.headingDeadbandDeg)return;this.heading=(this.heading+delta*this.config.headingSmoothingAlpha+360)%360}this.onHeading(this.heading);
  }
  stop() { window.removeEventListener('deviceorientationabsolute', this.handler, true); window.removeEventListener('deviceorientation', this.handler, true); }
}
