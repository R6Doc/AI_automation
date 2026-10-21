// Downloads every team's logo into public/logos/<sport>/<team-id>.<ext>.
//   College football: ESPN, 500x500 transparent PNG, from the espnId field.
//   NBA: nba.com, vector SVG, from the nbaId field.
//   NFL, MLB: from the logoUrl field (nfl.com / mlbstatic.com). SVG where the league has one,
//   otherwise the largest PNG; the file gets whichever extension matches what came back.
// Existing files are skipped unless --force is passed.
//
//   node scripts/fetch-logos.mjs                    # all sports, missing logos only
//   node scripts/fetch-logos.mjs nba                # one sport
//   node scripts/fetch-logos.mjs --force            # re-download all
//   node scripts/fetch-logos.mjs college-football --dark   # ESPN's variants made for dark backgrounds

import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const force = process.argv.includes("--force");
const espnVariant = process.argv.includes("--dark") ? "500-dark" : "500";

const isSvg = (buf) => buf.subarray(0, 500).toString().includes("<svg");
const isPng = (buf) => buf.subarray(1, 4).toString() === "PNG";
const svgOrPng = (buf) => (isSvg(buf) ? ".svg" : isPng(buf) ? ".png" : null);

const SOURCES = {
  "college-football": {
    ext: ".png",
    url: (t) => t.espnId && `https://a.espncdn.com/i/teamlogos/ncaa/${espnVariant}/${t.espnId}.png`,
    check: isPng,
    missing: "no espnId",
  },
  nba: {
    ext: ".svg",
    url: (t) => t.nbaId && `https://cdn.nba.com/logos/nba/${t.nbaId}/global/L/logo.svg`,
    check: isSvg,
    missing: "no nbaId",
  },
  nfl: { url: (t) => t.logoUrl, detect: svgOrPng, missing: "no logoUrl" },
  mlb: { url: (t) => t.logoUrl, detect: svgOrPng, missing: "no logoUrl" },
};

const wanted = process.argv.slice(2).filter((a) => !a.startsWith("--"));
for (const sport of wanted) if (!SOURCES[sport]) throw new Error(`Unknown sport "${sport}". Use: ${Object.keys(SOURCES).join(", ")}`);

for (const sport of wanted.length ? wanted : Object.keys(SOURCES)) {
  const source = SOURCES[sport];
  const { teams } = JSON.parse(fs.readFileSync(path.join(root, "data", `${sport}.json`), "utf8"));
  const outDir = path.join(root, "public", "logos", sport);
  fs.mkdirSync(outDir, { recursive: true });
  let downloaded = 0, skipped = 0;
  const failed = [];

  for (const team of teams) {
    const url = source.url(team);
    if (!url) { failed.push(`${team.name} (${source.missing})`); continue; }
    const existing = [".svg", ".png"].map((e) => path.join(outDir, team.id + e)).filter((f) => fs.existsSync(f));
    if (!force && existing.length) { skipped++; continue; }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const ext = source.detect ? source.detect(buf) : source.check(buf) && source.ext;
      if (!ext) throw new Error("not an SVG or PNG");
      for (const f of existing) fs.unlinkSync(f); // an SVG would otherwise keep winning over a new PNG
      fs.writeFileSync(path.join(outDir, team.id + ext), buf);
      downloaded++;
    } catch (err) {
      failed.push(`${team.name} (${err.message})`);
    }
  }

  console.log(`${sport}: downloaded ${downloaded}, skipped ${skipped} existing, failed ${failed.length}`);
  if (failed.length) console.log("  Failed:\n    " + failed.join("\n    "));
}
