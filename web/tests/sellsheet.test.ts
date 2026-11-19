// Run: node --experimental-strip-types tests/sellsheet.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { docxParagraphs, parseSellSheet } from "../src/lib/sellsheet.ts";

const read = (name: string) => {
  const zip = unzipSync(new Uint8Array(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url))));
  return parseSellSheet(docxParagraphs(strFromU8(zip["word/document.xml"])));
};

{
  const { fields: f, notes } = read("compare-1.docx");
  assert.equal(f.name, "Mars The Lucky Cat Solla");
  assert.match(notes[0], /two ways/);
  assert.equal(f.size, "700 ml");
  assert.equal(f.abv, "43% ABV");
  assert.equal(f.style, "Blended Whisky");
  assert.equal(f.age, "NAS");
  assert.equal(f.peat, "Unpeated");
  assert.equal(f.barrels, "Chestnut, Sherry, Wine, American, and Spanish Oak Casks");
  assert.equal(f.specialNote, "The 11th Edition of The Lucky Cat Series.");
  assert.match(f.description, /^The 11th edition of the Lucky Cat series/);
  assert.match(f.description, /\n\nFrom Hombo San:\n"On a rainy Sunday/);
  assert.match(f.description, /\(laughs\)\."$/);
  assert.equal(f.tastingNotes, "", "no Tasting Notes section → stays empty");
  assert.equal(f.distilleryName, "Mars Whisky");
  assert.match(f.distilleryAbout, /^Mars Hombo can trace its roots/);
  assert.match(f.distilleryAbout, /Japanese whisky\.$/);
}

{
  const { fields: f, notes } = read("compare-2.docx");
  assert.equal(f.name, "Mars The Lucky Cat Double Individuals Choco & Luna");
  assert.deepEqual(notes, []);
  assert.equal(f.barrels, "American Oak, Oloroso Sherry, Port, and Cherry Wood Casks");
  assert.match(f.description, /toasted cinnamon\.\n\nFrom Hombo san:\n“Choco/);
  assert.equal(f.tastingNotes, "");
  assert.equal(f.distilleryName, "Mars Whisky");
}

{
  // An explicit Tasting Notes section is the only thing that fills tasting notes.
  const { fields: f } = parseSellSheet([
    "Test Whisky", "ABV: 46%", "Test Whisky", "A fine dram.", "Tasting Notes:", "Honey and smoke.", "About Test Distillery:", "Distilled in the hills.",
  ]);
  assert.equal(f.tastingNotes, "Honey and smoke.");
  assert.equal(f.description, "A fine dram.");
  assert.equal(f.distilleryName, "Test Distillery");
  assert.equal(f.distilleryAbout, "Distilled in the hills.");
}

console.log("sellsheet tests passed");

{
  // Akkeshi format: extra spec labels, headings without colons, "About the Producer".
  const { fields: f, notes } = read("akkeshi-soko.docx");
  assert.equal(f.name, "The Akkeshi Blended Whisky Soko");
  assert.equal(f.size, "700 ml");
  assert.equal(f.abv, "48% ABV");
  assert.equal(f.region, "Akkeshi, Hokkaido, Japan");
  assert.equal(f.mapLabel, "Hokkaido • Japan");
  assert.equal(f.style, "Blended Whisky");
  assert.equal(f.age, "NAS");
  assert.equal(f.peat, "8ppm");
  assert.equal(f.barrels, "Ex-Bourbon, Virgin American Oak, Mizunara, Sherry");
  assert.equal(f.specialNote, "17th Release in Akkeshi’s 24 Sekki Series");
  assert.equal(f.extras, "Average Age of Whisky if NAS: 3+ years");
  assert.match(f.description, /^The Akkeshi Blended Whisky Soko is the 17th release/);
  assert.match(f.description, /sea salt\.$/);
  assert.equal(f.tastingNotes, "");
  assert.equal(f.distilleryName, "Akkeshi Distillery");
  assert.match(f.distilleryAbout, /^Located in Japan’s northern most island/);
  assert.deepEqual(notes, []);
}

console.log("akkeshi test passed");
