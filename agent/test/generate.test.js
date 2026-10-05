// Runs illustrator/generate.jsx against a tiny fake Illustrator DOM, so layout logic can be
// checked without Illustrator. It only simulates what the script uses; real Illustrator is
// still the final test.  Run: node agent/test/generate.test.js
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const JSX = fs.readFileSync(path.join(__dirname, "..", "illustrator", "generate.jsx"), "utf8");
const LINE_HEIGHT = 30;

// ---------- fake DOM ----------

function item(typename, name, bounds, children = []) {
  const it = {
    typename, name, locked: false, hidden: false, parent: null, kids: [], _b: bounds.slice(),
    get geometricBounds() {
      if (typename !== "GroupItem") return this._b.slice();
      const bs = this.kids.map((k) => k.geometricBounds);
      return [Math.min(...bs.map((b) => b[0])), Math.max(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.min(...bs.map((b) => b[3]))];
    },
    translate(dx, dy) {
      if (typename === "GroupItem") return this.kids.forEach((k) => k.translate(dx, dy));
      this._b = [this._b[0] + dx, this._b[1] + dy, this._b[2] + dx, this._b[3] + dy];
    },
    resize(sx) {
      const g = this.geometricBounds, cx = (g[0] + g[2]) / 2, cy = (g[1] + g[3]) / 2, s = sx / 100;
      const scale = (o) => o.typename === "GroupItem" ? o.kids.forEach(scale)
        : (o._b = [cx + (o._b[0] - cx) * s, cy + (o._b[1] - cy) * s, cx + (o._b[2] - cx) * s, cy + (o._b[3] - cy) * s]);
      scale(this);
    },
    remove() { this.parent.kids.splice(this.parent.kids.indexOf(this), 1); this.parent = null; },
    move(rel) { this.parent.kids.splice(this.parent.kids.indexOf(this), 1); insertBefore(rel, this); },
    duplicate(rel) { const c = clone(this); insertBefore(rel, c); return c; },
    embed() {},
  };
  if (typename === "TextFrame") {
    let text = "";
    Object.defineProperty(it, "contents", {
      get: () => text,
      set(v) { text = v; it._b[3] = it._b[1] - v.split("\r").length * LINE_HEIGHT; }, // grows downward like point text
    });
  }
  children.forEach((c) => { c.parent = it; it.kids.push(c); });
  it.pageItems = new Proxy({}, { get: (_, k) => (k === "length" ? it.kids.length : it.kids[k]) });
  it.groupItems = { createFromFile: (f) => add(it, item("GroupItem", "", [0, 0, 0, 0], [item("PathItem", "", [0, 50, 200, 0])]), f) };
  it.placedItems = { add: () => add(it, item("PlacedItem", "", [0, 100, 100, 0])) };
  it.layers = { length: 0 };
  return it;
}
function add(parent, child, file) { child.parent = parent; parent.kids.push(child); child.file = file; return child; }
function insertBefore(rel, it) { const p = rel.parent; p.kids.splice(p.kids.indexOf(rel), 0, it); it.parent = p; }
function clone(o) {
  const c = item(o.typename, o.name, o._b, o.kids.map(clone));
  if (o.typename === "TextFrame") { c.contents = o.contents; c._b = o._b.slice(); }
  return c;
}

// One version layer: 8 designed rows in a 1000pt area, prototype in slot 3. `dy` offsets the artboard.
function versionLayer(name, dy) {
  const t = (n, b, text) => { const f = item("TextFrame", n, b); f.contents = text; f._b = b.slice(); return f; };
  const row = item("GroupItem", "MATCH_ROW", [0, 0, 0, 0], [
    item("PathItem", "HOME_LOGO", [120, 1030 + dy, 200, 950 + dy]),
    t("HOME_NAME", [250, 1020 + dy, 400, 960 + dy], "Old\rName"),
    t("TIME", [480, 980 + dy, 600, 960 + dy], "10:00 am"),
    t("AWAY_NAME", [650, 1020 + dy, 800, 960 + dy], "Old\rName"),
    item("PathItem", "AWAY_LOGO", [880, 1030 + dy, 960, 950 + dy]),
    item("PathItem", "", [100, 936 + dy, 980, 935 + dy]), // divider
  ]);
  return item("Layer", name, [0, 0, 0, 0], [
    item("PathItem", "", [0, 2000 + dy, 1080, dy]), // background
    t("DATE", [200, 1800 + dy, 800, 1750 + dy], "Thursday, October 1"),
    row,
    item("PathItem", "ROWS_AREA", [100, 1300 + dy, 980, 300 + dy]),
  ]);
}

function run(matchCount, withLogos) {
  const layers = [versionLayer("STORY", 0), versionLayer("PORTRAIT", -5000), item("Layer", "Notes", [0, 0, 0, 0], [item("PathItem", "", [0, 1, 1, 0])])];
  const doc = { typename: "Document", kids: layers, layers: Object.assign({ length: layers.length }, layers), saveAs() {}, save() {}, close() {} };
  layers.forEach((l) => (l.parent = doc));
  const job = {
    dateLabel: "Saturday, October 3", templatePath: "/t.ai", outputPath: "/o.ai", templateRowCount: 8,
    matches: Array.from({ length: matchCount }, (_, i) => ({
      home: { name: "San Diego State", lines: ["San", "Diego", "State"], logoPath: withLogos ? "/logo.svg" : null },
      away: { name: "UConn", lines: ["UConn"], logoPath: withLogos && i % 2 ? "/logo.png" : null },
      time: "7:00 pm",
    })),
  };
  const ctx = {
    app: { userInteractionLevel: 1, open: () => doc },
    UserInteractionLevel: { DONTDISPLAYALERTS: 0 }, IllustratorSaveOptions: function () {}, SaveOptions: { DONOTSAVECHANGES: 0 },
    ElementPlacement: { PLACEBEFORE: 1 }, Transformation: { CENTER: 1 },
    File: function (p) { this.path = p; this.open = () => true; this.read = () => JSON.stringify(job); this.close = () => {}; this.remove = () => {}; },
    arguments: ["/job.json"],
  };
  const result = JSON.parse(vm.runInNewContext(JSX, ctx));
  return { result, layers };
}

const centerY = (it) => { const b = it.geometricBounds; return (b[1] + b[3]) / 2; };
const named = (parent, name) => parent.kids.find((k) => k.name === name);
const divider = (row) => row.kids.find((k) => k.typename === "PathItem" && k.name === ""); // fixed reference point

// ---------- tests ----------

for (const [count, logos] of [[1, true], [3, false], [8, true], [10, true]]) {
  const { result, layers } = run(count, logos);
  assert.equal(result.ok, true, result.error);

  for (const [layer, dy] of [[layers[0], 0], [layers[1], -5000]]) {
    const rows = layer.kids.filter((k) => /^MATCH_\d+$/.test(k.name));
    assert.equal(rows.length, count, `${layer.name}: one row per match`);
    assert.equal(named(layer, "DATE").contents, "Saturday, October 3");
    assert.ok(!named(layer, "MATCH_ROW") && !named(layer, "ROWS_AREA"), `${layer.name}: helpers removed`);

    // Rows are evenly spaced and stay inside the area.
    const centers = rows.map((r) => centerY(divider(r)));
    const gaps = centers.slice(1).map((c, i) => centers[i] - c);
    gaps.forEach((g) => assert.ok(Math.abs(g - gaps[0]) < 1e-6, `${layer.name}: even spacing`));
    rows.forEach((r) => {
      const b = r.geometricBounds;
      assert.ok(b[1] <= 1300 + dy + 1e-6 && b[3] >= 300 + dy - 1e-6, `${layer.name}: row inside ROWS_AREA`);
    });

    // With exactly the designed count, row 3 lands exactly where the designer put it.
    if (count === 8) assert.ok(Math.abs(centerY(divider(rows[2])) - (935.5 + dy)) < 1e-6, `${layer.name}: slot 3 untouched`);
    // 9+ matches shrink rows; up to 8 keep full size.
    const homeLogo = named(rows[0], "HOME_LOGO");
    if (count > 8 && homeLogo) assert.ok(homeLogo.geometricBounds[1] - homeLogo.geometricBounds[3] < 80, "rows shrink");

    // Names are written with line breaks; logos replace placeholders or are removed.
    assert.equal(named(rows[0], "HOME_NAME").contents, "San\rDiego\rState");
    if (logos) assert.equal(named(rows[0], "HOME_LOGO").typename, "GroupItem");
    else assert.equal(named(rows[0], "HOME_LOGO"), undefined);
  }
  assert.equal(layers[2].kids.length, 1, "unrelated layers untouched");
  console.log(`✓ ${count} match(es), logos ${logos ? "on" : "off"}: both versions filled`);
}

// A version layer missing a piece gives a clear error.
{
  const broken = versionLayer("STORY", 0);
  broken.kids.splice(broken.kids.findIndex((k) => k.name === "DATE"), 1);
  const doc = { typename: "Document", kids: [broken], layers: { length: 1, 0: broken }, saveAs() {}, save() {}, close() {} };
  broken.parent = doc;
  const ctx = {
    app: { userInteractionLevel: 1, open: () => doc }, UserInteractionLevel: { DONTDISPLAYALERTS: 0 },
    IllustratorSaveOptions: function () {}, SaveOptions: { DONOTSAVECHANGES: 0 }, ElementPlacement: { PLACEBEFORE: 1 }, Transformation: { CENTER: 1 },
    File: function () { this.open = () => true; this.read = () => JSON.stringify({ dateLabel: "x", matches: [], templateRowCount: 8, outputPath: "/o.ai" }); this.close = () => {}; this.remove = () => {}; },
    arguments: ["/job.json"],
  };
  const result = JSON.parse(vm.runInNewContext(JSX, ctx));
  assert.equal(result.ok, false);
  assert.match(result.error, /missing "DATE" inside layer "STORY"/);
  console.log("✓ missing DATE reported clearly");
}
