// Generates PNG PWA icons for all three apps without any image libraries:
// hand-rolled PNG encoder (Node zlib) + procedural drawing.
// Usage: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

// ---------- minimal PNG encoder ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- tiny rasterizer (RGBA canvas, alpha blending) ----------
function canvas(size) {
  return { size, px: Buffer.alloc(size * size * 4) };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function gradientDiagonal(c, [r1, g1, b1], [r2, g2, b2]) {
  const { size, px } = c;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * size - 2);
      const i = (y * size + x) * 4;
      px[i] = Math.round(lerp(r1, r2, t));
      px[i + 1] = Math.round(lerp(g1, g2, t));
      px[i + 2] = Math.round(lerp(b1, b2, t));
      px[i + 3] = 255;
    }
  }
}

function blendCircle(c, cx, cy, radius, [r, g, b], alpha, ringWidth = 0) {
  const { size, px } = c;
  const rOuter = radius + (ringWidth ? ringWidth / 2 : 0);
  const rInner = ringWidth ? radius - ringWidth / 2 : -1;
  const x0 = Math.max(0, Math.floor(cx - rOuter));
  const x1 = Math.min(size - 1, Math.ceil(cx + rOuter));
  const y0 = Math.max(0, Math.floor(cy - rOuter));
  const y1 = Math.min(size - 1, Math.ceil(cy + rOuter));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      // 1px anti-aliased edge on both outer and inner boundaries
      const edge = Math.min(ringWidth ? d - rInner : Infinity, rOuter - d);
      const cover = Math.max(0, Math.min(1, edge + 0.5));
      if (cover <= 0) continue;
      const a = alpha * cover;
      const i = (y * size + x) * 4;
      px[i] = Math.round(lerp(px[i], r, a));
      px[i + 1] = Math.round(lerp(px[i + 1], g, a));
      px[i + 2] = Math.round(lerp(px[i + 2], b, a));
      px[i + 3] = 255;
    }
  }
}

function blendSegment(c, x1, y1, x2, y2, width, [r, g, b], alpha) {
  const { size, px } = c;
  const minX = Math.max(0, Math.floor(Math.min(x1, x2) - width));
  const maxX = Math.min(size - 1, Math.ceil(Math.max(x1, x2) + width));
  const minY = Math.max(0, Math.floor(Math.min(y1, y2) - width));
  const maxY = Math.min(size - 1, Math.ceil(Math.max(y1, y2) + width));
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const t = Math.max(0, Math.min(1, ((x + 0.5 - x1) * dx + (y + 0.5 - y1) * dy) / len2));
      const d = Math.hypot(x + 0.5 - (x1 + t * dx), y + 0.5 - (y1 + t * dy));
      const cover = Math.max(0, Math.min(1, width - d + 0.5));
      if (cover <= 0) continue;
      const a = alpha * cover;
      const i = (y * size + x) * 4;
      px[i] = Math.round(lerp(px[i], r, a));
      px[i + 1] = Math.round(lerp(px[i + 1], g, a));
      px[i + 2] = Math.round(lerp(px[i + 2], b, a));
      px[i + 3] = 255;
    }
  }
}

// ---------- app designs (all full-bleed, ~12% safe padding → maskable-safe) ----------
const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

function drawGetInspired(size) {
  const c = canvas(size);
  gradientDiagonal(c, hex('#f8b500'), hex('#ff7e5f')); // app's shimmer gradient
  const m = size / 512; // design-space multiplier
  // Sun: core + 8 rays
  blendCircle(c, 256 * m, 256 * m, 78 * m, [255, 255, 255], 0.96);
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    blendSegment(
      c,
      256 * m + Math.cos(a) * 112 * m,
      256 * m + Math.sin(a) * 112 * m,
      256 * m + Math.cos(a) * 158 * m,
      256 * m + Math.sin(a) * 158 * m,
      14 * m,
      [255, 255, 255],
      0.96
    );
  }
  return c;
}

function drawVicinityGo(size) {
  const c = canvas(size);
  gradientDiagonal(c, hex('#0b1020'), hex('#1a2c5b')); // app bg
  const m = size / 512;
  // Radar rings
  blendCircle(c, 256 * m, 256 * m, 160 * m, [148, 180, 255], 0.28, 3 * m);
  blendCircle(c, 256 * m, 256 * m, 96 * m, [148, 180, 255], 0.4, 3 * m);
  // Checkpoint dots + center position
  blendCircle(c, 256 * m, 256 * m, 58 * m, hex('#4f7cff')[0] === undefined ? [79, 124, 255] : [79, 124, 255], 1);
  blendCircle(c, 196 * m, 210 * m, 26 * m, [72, 215, 133], 1);
  blendCircle(c, 330 * m, 300 * m, 26 * m, [255, 209, 102], 1);
  return c;
}

function drawFriendCredit(size) {
  const c = canvas(size);
  gradientDiagonal(c, hex('#241611'), hex('#140f0d')); // bureau backdrop
  const m = size / 512;
  // Medal: gold ring + solid core
  blendCircle(c, 256 * m, 256 * m, 138 * m, [245, 197, 107], 1, 34 * m);
  blendCircle(c, 256 * m, 256 * m, 62 * m, [232, 160, 75], 1);
  // Ribbon notches above the medal
  blendSegment(c, 200 * m, 92 * m, 236 * m, 150 * m, 16 * m, [232, 106, 94], 1);
  blendSegment(c, 312 * m, 92 * m, 276 * m, 150 * m, 16 * m, [232, 106, 94], 1);
  return c;
}

// ---------- emit ----------
function emit(canvas, path) {
  mkdirSync(path.substring(0, path.lastIndexOf('/')), { recursive: true });
  writeFileSync(path, encodePng(canvas.size, canvas.size, canvas.px));
  console.log('wrote', path);
}

const out = (repo, name) => `${repo}/public/${name}`;

for (const size of [192, 512]) {
  emit(drawGetInspired(size), out('.', `icon-${size}.png`));
  emit(drawVicinityGo(size), out('vicinitygo', `icon-${size}.png`));
  emit(drawFriendCredit(size), out('brocredit', `icon-${size}.png`));
}
emit(drawGetInspired(180), out('.', 'apple-touch-icon.png'));
emit(drawVicinityGo(180), out('vicinitygo', 'apple-touch-icon.png'));
emit(drawFriendCredit(180), out('brocredit', 'apple-touch-icon.png'));
console.log('done');
