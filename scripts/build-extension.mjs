/**
 * Build the Publish Chrome extension zip — public/publish-extension-v<version>.zip
 * (v0.6.0). Runs on every `npm run build`, before `next build`.
 *
 * "Publish by Gershon.AI — LinkedIn & X Publisher" is Publish's OWN extension
 * (THREE-PLATFORM-SPLIT.md §8, §14.4): it only publishes due posts from
 * publish.gershon.ai. It never collects — Social's extension does that.
 *
 * Source of truth: extension-src/ (the same folder people "Load unpacked"
 * from, as publish-chrome-extension). The toolbar icons are drawn by
 * scripts/publish-icon.mjs and written into extension-src/icons/ too, so the
 * unpacked folder is complete.
 *
 * Checks that STOP the build:
 *   - manifest version != EXTENSION_LATEST in src/lib/extension-version.ts
 *     (every download link is built from that constant);
 *   - any collection file (Social's gx-collect / gx-linkedin / sync-core /
 *     gx-remote) present in extension-src/.
 *
 * Entries are STORED (no compression) with a fixed date, so the same source
 * always gives the same zip.
 */
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { publishIconPng } from "./publish-icon.mjs";

const SRC_DIR = "extension-src";
const FORBIDDEN = ["gx-collect.js", "gx-linkedin.js", "sync-core.js", "gx-remote.js", "gx-personal.js"];

const manifest = JSON.parse(readFileSync(join(SRC_DIR, "manifest.json"), "utf8"));
const LATEST_MATCH = readFileSync("src/lib/extension-version.ts", "utf8").match(/EXTENSION_LATEST\s*=\s*"([^"]+)"/);
const LATEST = LATEST_MATCH ? LATEST_MATCH[1] : null;
if (!manifest.version || manifest.version !== LATEST) {
  console.error(`extension: manifest version ${manifest.version} != EXTENSION_LATEST ${LATEST} — bump both together.`);
  process.exit(1);
}
for (const f of FORBIDDEN) {
  if (existsSync(join(SRC_DIR, f))) {
    console.error(`extension: ${f} is collection code and must not ship in the Publish extension.`);
    process.exit(1);
  }
}

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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function writeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const data = e.data;
    const crc = crc32(data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    locals.push(local, data);
    centrals.push(central);
    offset += local.length + data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, eocd]);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// Icons into the source folder, so "Load unpacked" has them too.
mkdirSync(join(SRC_DIR, "icons"), { recursive: true });
for (const size of [16, 48, 128]) writeFileSync(join(SRC_DIR, "icons", `icon${size}.png`), publishIconPng(size));

const entries = walk(SRC_DIR)
  .map((file) => ({ name: relative(SRC_DIR, file).split(sep).join("/"), data: readFileSync(file) }))
  .filter((e) => !/(^|\/)\.|README/i.test(e.name));
// manifest.json first: easier to eyeball with `unzip -l`.
entries.sort((a, b) => (a.name === "manifest.json" ? -1 : b.name === "manifest.json" ? 1 : a.name.localeCompare(b.name)));

mkdirSync("public", { recursive: true });
const out = `public/publish-extension-v${manifest.version}.zip`;
writeFileSync(out, writeZip(entries));
console.log(`extension: ${entries.length} files -> ${out} (${manifest.name})`);
