import QRCode, { QRErrorCorrectLevel } from './vendor/qrcode-generator.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const QUIET_ZONE = 4;

/** Create a standards-compliant QR code SVG for the supplied text. */
export function createQrSvg(text, { size = 240 } = {}) {
  const qr = new QRCode(0, QRErrorCorrectLevel.M);
  qr.addData(text);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const extent = moduleCount + QUIET_ZONE * 2;
  const modules = [];

  for (let row = 0; row < moduleCount; row += 1) {
    for (let column = 0; column < moduleCount; column += 1) {
      if (qr.isDark(row, column)) {
        modules.push(`M${column + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`);
      }
    }
  }

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${extent} ${extent}`);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'QR kód s odkazem na PID AR');

  const background = document.createElementNS(SVG_NS, 'rect');
  background.setAttribute('width', extent);
  background.setAttribute('height', extent);
  background.setAttribute('fill', 'white');
  svg.append(background);

  const foreground = document.createElementNS(SVG_NS, 'path');
  foreground.setAttribute('d', modules.join(''));
  foreground.setAttribute('fill', 'black');
  svg.append(foreground);

  return svg;
}
