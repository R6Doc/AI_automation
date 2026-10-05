// Runs illustrator/prepare-template.jsx against a fake document built like the real
// template-for-agent.ai (Story + Portrait artboards, 8 rows each, same grouping), then runs
// generate.jsx on the result. Run: node agent/test/prepare.test.js
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const DIR = path.join(__dirname, "..", "illustrator");
const PREPARE = fs.readFileSync(path.join(DIR, "prepare-template.jsx"), "utf8");
const GENERATE = fs.readFileSync(path.join(DIR, "generate.jsx"), "utf8");
const LINE_HEIGHT = 30;
let uid = 0;

// ---------- fake Illustrator DOM ----------

function node(typename, name, bounds) {
  const it = { typename, name: name || "", uuid: String(++uid), locked: false, hidden: false, clipped: false, parent: null, kids: [], _b: bounds ? bounds.slice() : null };
  Object.defineProperty(it, "geometricBounds", {
    get() {
      if (it.typename !== "GroupItem" && it.typename !== "Layer") return it._b.slice();
      const bs = it.kids.map((k) => k.geometricBounds);
      if (!bs.length) return [0, 0, 0, 0];
      return [Math.min(...bs.map((b) => b[0])), Math.max(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.min(...bs.map((b) => b[3]))];
    },
  });
  it.pageItems = new Proxy({}, { get: (_, k) => (k === "length" ? it.kids.length : it.kids[k]) });
  it.translate = (dx, dy) => (it.kids.length && !it._b ? it.kids.forEach((k) => k.translate(dx, dy)) : (it._b = [it._b[0] + dx, it._b[1] + dy, it._b[2] + dx, it._b[3] + dy]));
  it.resize = (sx) => {
    const g = it.geometricBounds, cx = (g[0] + g[2]) / 2, cy = (g[1] + g[3]) / 2, s = sx / 100;
    const sc = (o) => (o._b ? (o._b = [cx + (o._b[0] - cx) * s, cy + (o._b[1] - cy) * s, cx + (o._b[2] - cx) * s, cy + (o._b[3] - cy) * s]) : o.kids.forEach(sc));
    sc(it);
  };
  it.remove = () => { detach(it); };
  it.move = (rel, where) => {
    detach(it);
    if (where === "PLACEATBEGINNING") attach(rel, it, 0);
    else if (where === "PLACEATEND") attach(rel, it, rel.kids.length);
    else if (where === "PLACEBEFORE") attach(rel.parent, it, rel.parent.kids.indexOf(rel));
    else if (where === "PLACEAFTER") attach(rel.parent, it, rel.parent.kids.indexOf(rel) + 1);
    else throw new Error("bad placement " + where);
  };
  it.duplicate = (rel) => { const c = clone(it); attach(rel.parent, c, rel.parent.kids.indexOf(rel)); return c; };
  it.groupItems = {
    add: () => { const g = node("GroupItem"); attach(it, g, 0); return g; },
    createFromFile: () => { const g = node("GroupItem"); g.kids.push(Object.assign(node("PathItem", "", [0, 50, 200, 0]), { parent: g })); attach(it, g, 0); return g; },
  };
  it.pathItems = { rectangle: (top, left, w, h) => { const r = node("PathItem", "", [left, top, left + w, top - h]); attach(it, r, 0); return r; } };
  it.placedItems = { add: () => { const p = node("PlacedItem", "", [0, 100, 100, 0]); p.embed = () => {}; attach(it, p, 0); return p; } };
  it.layers = { length: 0 };
  if (typename === "TextFrame") {
    let text = "";
    Object.defineProperty(it, "contents", { get: () => text, set(v) { text = v; it._b[3] = it._b[1] - v.split("\r").length * LINE_HEIGHT; } });
  }
  return it;
}
function attach(parent, child, index) { parent.kids.splice(index, 0, child); child.parent = parent; }
function detach(it) { if (it.parent) { const i = it.parent.kids.indexOf(it); if (i >= 0) it.parent.kids.splice(i, 1); it.parent = null; } }
function clone(o) {
  const c = node(o.typename, o.name, o._b);
  o.kids.forEach((k) => attach(c, clone(k), c.kids.length));
  if (o.typename === "TextFrame") { c.contents = o.contents; c._b = o._b.slice(); }
  return c;
}
function group(...children) { const g = node("GroupItem"); children.forEach((c) => attach(g, c, g.kids.length)); return g; }
function text(s, l, t, r, b) { const f = node("TextFrame", "", [l, t, r, b]); f.contents = s; f._b = [l, t, r, b]; return f; }

function makeDoc() {
  const layers = [];
  const doc = { typename: "Document", name: "template.ai", kids: layers, artboards: null, saved: true, save() { doc.didSave = true; }, saveAs() {}, close() {} };
  doc.layers = new Proxy({}, {
    get: (_, k) => {
      if (k === "length") return layers.length;
      if (k === "add") return () => { const l = node("Layer"); l.parent = doc; l.visible = true; l.remove = () => layers.splice(layers.indexOf(l), 1); layers.unshift(l); return l; };
      return layers[k];
    },
  });
  return doc;
}

// Story (1080x1920) at x=0 and Portrait (1080x1350) at x=1200, like the real file: per row a
// name text, a grouped name text, a VS+time group, two grouped image logos, and a plain divider.
function realisticTemplate() {
  const doc = makeDoc();
  const layer = doc.layers.add();
  layer.name = "Layer 1";
  const boards = [
    { rect: [0, 0, 1080, -1920], firstRowY: -560, pitch: 137, title: -150 },
    { rect: [1200, 0, 2280, -1350], firstRowY: -340, pitch: 113, title: -80 },
  ];
  doc.artboards = Object.assign({ length: 2 }, boards.map((b, i) => ({ name: "Artboard " + (i + 1), artboardRect: b.rect })));
  for (const b of boards) {
    const x0 = b.rect[0];
    const add = (it) => attach(layer, it, layer.kids.length);
    add(node("RasterItem", "", [x0, 0, x0 + 1080, b.rect[3]])); // background photo
    add(group(text("Saturday, October 3", x0 + 250, b.title, x0 + 830, b.title - 40), text("football", x0 + 100, b.title - 60, x0 + 980, b.title - 160), text("college", x0 + 200, b.title - 150, x0 + 880, b.title - 250)));
    for (let r = 0; r < 8; r++) {
      const y = b.firstRowY - r * b.pitch;
      add(text("Notre\rDame", x0 + 300, y + 30, x0 + 440, y - 30));
      add(group(text("North\rCarolina", x0 + 640, y + 30, x0 + 790, y - 30)));
      add(group(group(text("vs", x0 + 505, y + 25, x0 + 565, y - 5)), group(text("10:00 am", x0 + 480, y - 10, x0 + 590, y - 25))));
      add(group(node("RasterItem", "", [x0 + 130, y + 40 - (r % 2) * 5, x0 + 230 + (r % 3) * 10, y - 40])));
      add(group(node("RasterItem", "", [x0 + 850, y + 38, x0 + 950, y - 38])));
      add(node("PathItem", "", [x0 + 170, y - 68, x0 + 910, y - 68.5]));
    }
    add(node("RasterItem", "", [x0 + 420, b.rect[3] + 230, x0 + 660, b.rect[3] + 60])); // Cabo Joe's logo
  }
  return doc;
}

function context(doc, extra) {
  return Object.assign({
    PREPARE_TEST: true,
    app: { activeDocument: doc, documents: { length: 1 }, executeMenuCommand() {}, userInteractionLevel: 1, open: () => doc },
    ElementPlacement: { PLACEBEFORE: "PLACEBEFORE", PLACEAFTER: "PLACEAFTER", PLACEATBEGINNING: "PLACEATBEGINNING", PLACEATEND: "PLACEATEND" },
    Transformation: { CENTER: 1 }, UserInteractionLevel: { DONTDISPLAYALERTS: 0 }, IllustratorSaveOptions: function () {}, SaveOptions: { DONOTSAVECHANGES: 0 },
  }, extra);
}

const find = (container, name) => {
  for (const k of container.kids) {
    if (k.name === name) return k;
    const f = find(k, name);
    if (f) return f;
  }
  return null;
};

// ---------- tests ----------

{
  const doc = realisticTemplate();
  const ctx = context(doc);
  vm.runInNewContext(PREPARE + "\nRESULT = prepare(app.activeDocument);", ctx);
  const { notes, counts } = ctx.RESULT;
  assert.deepEqual([...counts], [8, 8]);
  assert.deepEqual(doc.kids.map((l) => l.name).sort(), ["PORTRAIT", "STORY"], "one layer per version, original removed");

  for (const [layerName, rect, firstRowY, pitch] of [["STORY", [0, 0, 1080, -1920], -560, 137], ["PORTRAIT", [1200, 0, 2280, -1350], -340, 113]]) {
    const layer = doc.kids.find((l) => l.name === layerName);
    // Everything in the layer sits on its artboard.
    for (const k of layer.kids) {
      const b = k.geometricBounds;
      assert.ok((b[0] + b[2]) / 2 >= rect[0] && (b[0] + b[2]) / 2 <= rect[2], `${layerName}: item on its own artboard`);
    }
    const row = find(layer, "MATCH_ROW");
    assert.ok(row && row.parent === layer, `${layerName}: MATCH_ROW on the layer`);
    assert.equal(find(row, "HOME_NAME").contents, "Notre\rDame");
    assert.equal(find(row, "AWAY_NAME").contents, "North\rCarolina");
    assert.equal(find(row, "TIME").contents, "10:00 am");
    for (const side of ["HOME_LOGO", "AWAY_LOGO"]) {
      const box = find(row, side);
      assert.equal(box.typename, "PathItem", `${layerName}: ${side} is an empty box`);
      assert.equal(box.filled, false);
    }
    assert.equal(find(layer, "DATE").contents, "Saturday, October 3");
    const area = find(layer, "ROWS_AREA");
    const ab = area.geometricBounds;
    assert.ok(Math.abs(ab[1] - ab[3] - 8 * pitch) < 1e-6, `${layerName}: ROWS_AREA holds 8 slots`);
    assert.ok(Math.abs(ab[1] - (firstRowY + 10 + pitch / 2)) < 1e-6, `${layerName}: ROWS_AREA starts half a slot above row 1`);
    // Rows 2-8 are gone: exactly one VS left, and the Cabo logo/background/title remain.
    const texts = [];
    (function walk(c) { for (const k of c.kids) { if (k.typename === "TextFrame") texts.push(k.contents); walk(k); } })(layer);
    assert.equal(texts.filter((t) => t === "vs").length, 1, `${layerName}: only row 1 left`);
    assert.ok(texts.includes("football") && texts.includes("college"), `${layerName}: title kept`);
    assert.equal(layer.kids.filter((k) => k.typename === "RasterItem").length, 2, `${layerName}: background + Cabo logo kept`);
  }
  console.log("✓ realistic template prepared:", notes.join(" | "));

  // The prepared template works with generate.jsx.
  for (const count of [3, 10]) {
    const prepared = realisticTemplate();
    vm.runInNewContext(PREPARE + "\nprepare(app.activeDocument);", context(prepared));
    const job = {
      dateLabel: "Friday, October 9", templatePath: "/t.ai", outputPath: "/o.ai", templateRowCount: 8,
      matches: Array.from({ length: count }, () => ({ home: { name: "Baylor", lines: ["Baylor"], logoPath: "/b.svg" }, away: { name: "San Jose State", lines: ["San", "Jose", "State"], logoPath: null }, time: "8:30 pm" })),
    };
    const genCtx = context(prepared, {
      File: function () { this.open = () => true; this.read = () => JSON.stringify(job); this.close = () => {}; this.remove = () => {}; },
      arguments: ["/job.json"],
    });
    delete genCtx.PREPARE_TEST;
    const res = JSON.parse(vm.runInNewContext(GENERATE, genCtx));
    assert.equal(res.ok, true, res.error);
    for (const layer of prepared.kids) {
      const rows = layer.kids.filter((k) => /^MATCH_\d+$/.test(k.name));
      assert.equal(rows.length, count, `${layer.name}: ${count} rows generated`);
      assert.equal(find(layer, "DATE").contents, "Friday, October 9");
      const area = layer.kids.find((k) => k.name === "ROWS_AREA");
      assert.equal(area, undefined, "ROWS_AREA removed from output");
    }
    console.log(`✓ generate.jsx fills the prepared template with ${count} matches in both versions`);
  }
}

// Ambiguous file → clear error, nothing claimed.
{
  const doc = realisticTemplate();
  const layer = doc.kids[0];
  // Remove every "vs" on the Portrait artboard.
  (function strip(c) { for (const k of [...c.kids]) { if (k.typename === "TextFrame" && k.contents === "vs" && k.geometricBounds[0] > 1100) detach(k); else strip(k); } })(layer);
  const ctx = context(doc);
  assert.throws(() => vm.runInNewContext(PREPARE + "\nprepare(app.activeDocument);", ctx), (e) => /PORTRAIT artboard: Found 0 "VS"/.test(e.message));
  console.log("✓ missing VS texts reported with the artboard name");
}

// Running it twice is refused.
{
  const doc = realisticTemplate();
  vm.runInNewContext(PREPARE + "\nprepare(app.activeDocument);", context(doc));
  assert.throws(() => vm.runInNewContext(PREPARE + "\nprepare(app.activeDocument);", context(doc)), (e) => /already looks prepared/.test(e.message));
  console.log("✓ already-prepared template is left alone");
}
