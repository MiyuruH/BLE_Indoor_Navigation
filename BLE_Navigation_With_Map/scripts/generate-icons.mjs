// Generates PWA PNG icons (no external dependencies).
// Run: node scripts/generate-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../public/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

const BG = [6, 13, 26];
const ACCENT = [34, 211, 238];
const RING = [14, 116, 144];

function render(size, maskable) {
  // maskable icons need content inside the central 80% safe zone
  const scale = maskable ? 0.72 : 0.9;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const cx = size / 2;
  const cy = size / 2;
  const R = (size / 2) * scale;
  const SS = 3; // supersampling
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          let col = BG;
          let a = 255;
          if (!maskable) {
            // rounded square background
            const rr = size * 0.22;
            const dx = Math.max(Math.abs(px - cx) - (size / 2 - rr), 0);
            const dy = Math.max(Math.abs(py - cy) - (size / 2 - rr), 0);
            if (Math.hypot(dx, dy) > rr) a = 0;
          }
          const d = Math.hypot(px - cx, py - cy);
          // signal rings
          for (const f of [0.95, 0.75]) {
            if (Math.abs(d - R * f) < R * 0.045) col = RING;
          }
          // location pin: circle head + triangle tail
          const hx = cx;
          const hy = cy - R * 0.12;
          const hr = R * 0.36;
          const inHead = Math.hypot(px - hx, py - hy) < hr;
          const tipY = cy + R * 0.58;
          const t = (py - hy) / (tipY - hy);
          const inTail = t >= 0 && t <= 1 && Math.abs(px - hx) < hr * 0.87 * (1 - t);
          if (inHead || inTail) col = ACCENT;
          if (Math.hypot(px - hx, py - hy) < hr * 0.42) col = BG;
          acc[0] += col[0];
          acc[1] += col[1];
          acc[2] += col[2];
          acc[3] += a;
        }
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const n = SS * SS;
      raw[o] = acc[0] / n;
      raw[o + 1] = acc[1] / n;
      raw[o + 2] = acc[2] / n;
      raw[o + 3] = acc[3] / n;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const targets = [
  ['pwa-192x192.png', 192, false],
  ['pwa-512x512.png', 512, false],
  ['maskable-512x512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
  ['favicon-64x64.png', 64, false],
];
for (const [name, size, maskable] of targets) {
  writeFileSync(new URL(name, OUT), render(size, maskable));
  console.log('wrote', name);
}
