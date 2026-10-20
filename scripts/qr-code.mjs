import { QrCode } from './vendor/qrcodegen.mjs';

// Server-side only: all encoding stays on this computer, with no runtime requests.
export function qrSvg(text) {
  if (typeof text !== 'string') throw new TypeError('QR content must be a string.');
  const qr = QrCode.encodeText(text, QrCode.Ecc.MEDIUM);
  const border = 4;
  const size = qr.size + border * 2;
  const modules = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) modules.push(`M${x + border},${y + border}h1v1h-1z`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="320" height="320" role="img" aria-label="Scan to open the phone preview" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${modules.join(' ')}" fill="#000"/></svg>`;
}
