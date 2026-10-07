// Downloads every team's logo from ESPN into public/logos/<team-id>.png (500x500, transparent).
// Uses the espnId field in data/teams.json. Existing files are skipped unless --force is passed.
//
//   node scripts/fetch-logos.mjs           # download missing logos
//   node scripts/fetch-logos.mjs --force   # re-download all
//   node scripts/fetch-logos.mjs --dark    # ESPN's variants made for dark backgrounds

import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const { teams } = JSON.parse(fs.readFileSync(path.join(root, "data", "teams.json"), "utf8"));
const outDir = path.join(root, "public", "logos");
const force = process.argv.includes("--force");
const variant = process.argv.includes("--dark") ? "500-dark" : "500";

fs.mkdirSync(outDir, { recursive: true });
let downloaded = 0, skipped = 0;
const failed = [];

for (const team of teams) {
  const file = path.join(outDir, `${team.id}.png`);
  if (!team.espnId) { failed.push(`${team.name} (no espnId)`); continue; }
  if (!force && fs.existsSync(file)) { skipped++; continue; }
  const url = `https://a.espncdn.com/i/teamlogos/ncaa/${variant}/${team.espnId}.png`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.subarray(1, 4).toString() !== "PNG") throw new Error("not a PNG");
    fs.writeFileSync(file, buf);
    downloaded++;
  } catch (err) {
    failed.push(`${team.name} (${err.message})`);
  }
}

console.log(`Downloaded ${downloaded}, skipped ${skipped} existing, failed ${failed.length}`);
if (failed.length) console.log("Failed:\n  " + failed.join("\n  "));
