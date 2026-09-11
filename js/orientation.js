export class OrientationController {
  constructor(onHeading) { this.onHeading = onHeading; this.handler = this.handle.bind(this); }
  async start() {
    if (typeof DeviceOrientationEvent === 'undefined') throw new Error('Orientace není podporována');
    if (typeof DeviceOrientationEvent.requestPermission === 'function' && await DeviceOrientationEvent.requestPermission() !== 'granted') throw new Error('Orientace nebyla povolena');
    window.addEventListener('deviceorientationabsolute', this.handler, true); window.addEventListener('deviceorientation', this.handler, true);
  }
  handle(event) {
    let heading = event.webkitCompassHeading;
    if (!Number.isFinite(heading) && Number.isFinite(event.alpha)) heading = (360 - event.alpha) % 360;
    if (Number.isFinite(heading)) this.onHeading(heading);
  }
  stop() { window.removeEventListener('deviceorientationabsolute', this.handler, true); window.removeEventListener('deviceorientation', this.handler, true); }
}
