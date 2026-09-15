import test from 'node:test';
import assert from 'node:assert/strict';
import { createQrSvg } from '../js/qr-code.js';

class Element {
  constructor(namespaceURI, tagName) {
    this.namespaceURI = namespaceURI;
    this.tagName = tagName;
    this.attributes = new Map();
    this.children = [];
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  append(...children) { this.children.push(...children); }
}

globalThis.document = {
  createElementNS(namespaceURI, tagName) { return new Element(namespaceURI, tagName); },
};

function renderSvg(svg, scale = 8) {
  const [, , width, height] = svg.getAttribute('viewBox').split(' ').map(Number);
  const pixels = new Uint8ClampedArray(width * scale * height * scale * 4);
  pixels.fill(255);
  const path = svg.children.find(child => child.tagName === 'path').getAttribute('d');
  for (const match of path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    const x = Number(match[1]);
    const y = Number(match[2]);
    for (let py = y * scale; py < (y + 1) * scale; py += 1) {
      for (let px = x * scale; px < (x + 1) * scale; px += 1) {
        const offset = (py * width * scale + px) * 4;
        pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
      }
    }
  }
  return { data: pixels, width: width * scale, height: height * scale };
}

let jsQR;
try {
  ({ default: jsQR } = await import('jsqr'));
} catch {
  // The declared dev dependency is installed in CI/normal development. Keep the
  // rest of the repository testable in dependency-free source checkouts.
}

for (const url of [
  'https://wondrej89.github.io/ZastavkyAR/from/qr/',
  'https://wondrej89.github.io/ZastavkyAR/from/qr/?test=123456789',
]) {
  test(`QR round-trips through independent decoder: ${url}`, { skip: !jsQR && 'jsqr dev dependency is not installed' }, () => {
    const svg = createQrSvg(url);
    const image = renderSvg(svg);
    const decoded = jsQR(image.data, image.width, image.height);
    assert.equal(decoded?.data, url);
    assert.equal(svg.getAttribute('shape-rendering'), 'crispEdges');
    assert.equal(svg.children[0].getAttribute('fill'), 'white');
    assert.equal(svg.children[1].getAttribute('fill'), 'black');
  });
}
