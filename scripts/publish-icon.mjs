/**
 * The Publish extension icon as PNG, drawn in plain JavaScript — no image
 * library and no binary file in the repo. Gershon red rounded square with a
 * white paper plane (the "send" glyph), on a 64-unit grid, 4×4 supersampled.
 *
 *   node scripts/publish-icon.mjs   → writes extension-src/icons/icon{16,48,128}.png
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function inRound(x, y, x0, y0, w, h, r) {
  if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** Point in polygon (even-odd). */
function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

const RED_TOP = hex("#E3382B");
const RED_BOTTOM = hex("#B3221A");
const WHITE = hex("#FFFFFF");
const FOLD = hex("#D9DCE0");

// Paper plane: nose at the top right, wings to the left, tail at the bottom.
const PLANE = [
  [11, 31],
  [53, 12],
  [36, 52],
  [28, 38],
];
// The darker fold under the right wing.
const FOLD_TRI = [
  [28, 38],
  [53, 12],
  [31, 48],
];

/** Colour of the icon at (x, y) on the 64 grid, or null outside it. */
function colourAt(x, y) {
  if (!inRound(x, y, 1, 1, 62, 62, 14)) return null;
  if (inPoly(x, y, FOLD_TRI)) return FOLD;
  if (inPoly(x, y, PLANE)) return WHITE;
  return mix(RED_TOP, RED_BOTTOM, (x + y) / 128);
}

const CRC = (() => {
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
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** A size×size RGBA PNG of the icon, 4×4 supersampled. */
export function publishIconPng(size) {
  const S = 4;
  const row = size * 4 + 1;
  const raw = Buffer.alloc(size * row);
  for (let py = 0; py < size; py++) {
    raw[py * row] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const c = colourAt(((px + (sx + 0.5) / S) / size) * 64, ((py + (sy + 0.5) / S) / size) * 64);
          if (!c) continue;
          a++; r += c[0]; g += c[1]; b += c[2];
        }
      }
      const o = py * row + 1 + px * 4;
      if (a) {
        raw[o] = Math.round(r / a);
        raw[o + 1] = Math.round(g / a);
        raw[o + 2] = Math.round(b / a);
      }
      raw[o + 3] = Math.round((a / (S * S)) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync("extension-src/icons", { recursive: true });
  for (const size of [16, 48, 128]) writeFileSync(`extension-src/icons/icon${size}.png`, publishIconPng(size));
  console.log("publish-icon: wrote extension-src/icons/icon{16,48,128}.png");
}
