/**
 * Generates a 512x512 placeholder PNG icon for electron-builder.
 * Replace electron/build-resources/icon.png with a real icon before production builds.
 *
 * Run: node scripts/generate-placeholder-icon.mjs
 */

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createDeflateRaw } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "..", "electron", "build-resources", "icon.png");

const WIDTH = 512;
const HEIGHT = 512;

// Colors: dark blue background (#1a1a2e) with lighter blue accent (#16213e)
const BG_R = 0x1a, BG_G = 0x1a, BG_B = 0x2e;
const ACCENT_R = 0x0f, ACCENT_G = 0x3d, ACCENT_B = 0x6b;

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const combined = Buffer.concat([typeBytes, data]);
  const crcVal = Buffer.alloc(4);
  crcVal.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, combined, crcVal]);
}

function buildRawImageData() {
  // Each row: filter byte (0) + RGB pixels
  const rowSize = 1 + WIDTH * 3;
  const rows = [];
  for (let y = 0; y < HEIGHT; y++) {
    const row = Buffer.alloc(rowSize);
    row[0] = 0; // No filter
    for (let x = 0; x < WIDTH; x++) {
      const offset = 1 + x * 3;
      // Simple gradient pattern: darker center, lighter edges
      const cx = Math.abs(x - WIDTH / 2) / (WIDTH / 2);
      const cy = Math.abs(y - HEIGHT / 2) / (HEIGHT / 2);
      const dist = Math.min(1, Math.sqrt(cx * cx + cy * cy));

      const r = Math.round(BG_R + (ACCENT_R - BG_R) * dist);
      const g = Math.round(BG_G + (ACCENT_G - BG_G) * dist);
      const b = Math.round(BG_B + (ACCENT_B - BG_B) * dist);

      row[offset] = r;
      row[offset + 1] = g;
      row[offset + 2] = b;
    }
    rows.push(row);
  }
  return Buffer.concat(rows);
}

function compressRaw(raw) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const deflator = createDeflateRaw({ level: 9 });
    deflator.on("data", (d) => chunks.push(d));
    deflator.on("end", () => resolve(Buffer.concat(chunks)));
    deflator.on("error", reject);
    deflator.end(raw);
  });
}

async function main() {
  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR: width, height, bit depth (8), color type (2 = RGB), compression (0), filter (0), interlace (0)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(WIDTH, 0);
  ihdrData.writeUInt32BE(HEIGHT, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type: RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = chunk("IHDR", ihdrData);

  // IDAT: compressed image data
  const raw = buildRawImageData();
  const compressed = await compressRaw(raw);
  const idat = chunk("IDAT", compressed);

  // IEND
  const iend = chunk("IEND", Buffer.alloc(0));

  const png = Buffer.concat([signature, ihdr, idat, iend]);
  writeFileSync(outPath, png);
  console.log(`Placeholder icon (${WIDTH}x${HEIGHT}) written to: ${outPath}`);
  console.log("Replace with a real icon before production builds.");
}

main().catch((err) => {
  console.error("Failed to generate icon:", err);
  process.exit(1);
});
