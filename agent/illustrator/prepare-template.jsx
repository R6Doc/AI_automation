// prepare-template.jsx: run once in Illustrator (File → Scripts → Other Script…) with the
// unprepared template open. It does the TEMPLATE_SETUP.md steps automatically:
//
//   • each artboard's art goes to its own layer (STORY / PORTRAIT by shape)
//   • rows are found by their "VS" text; per row it finds the time ("10:00 AM"), the team names
//     (text left/right of VS), the logos (art at the far left/right) and the divider line below
//   • row 1 becomes MATCH_ROW with HOME_NAME, AWAY_NAME, TIME, HOME_LOGO, AWAY_LOGO; rows 2+ are deleted
//   • the date text becomes DATE, and ROWS_AREA is drawn around where the rows were
//
// A backup of the file is saved next to it first. If anything is ambiguous it stops and says
// where, without saving. ExtendScript is ES3: no let/const, no arrow functions.

var DAY_RE = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
var TIME_RE = /^\s*\d{1,2}:\d{2}\s*(am|pm|a\.m\.|p\.m\.)?\s*$/i;
var VS_RE = /^\s*vs\.?\s*$/i;

function PrepError(message) { this.message = message; }

// ---------- geometry ----------

function bnds(it) { return it.geometricBounds; } // [left, top, right, bottom], top > bottom
function cx(it) { var b = bnds(it); return (b[0] + b[2]) / 2; }
function cy(it) { var b = bnds(it); return (b[1] + b[3]) / 2; }
function wd(it) { var b = bnds(it); return b[2] - b[0]; }
function ht(it) { var b = bnds(it); return b[1] - b[3]; }
function inRect(x, y, r) { return x >= r[0] && x <= r[2] && y <= r[1] && y >= r[3]; }

function median(values) {
  var v = values.slice().sort(function (a, b) { return a - b; });
  if (!v.length) return 0;
  var m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
function percentile(values, p) {
  var v = values.slice().sort(function (a, b) { return a - b; });
  return v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : 0;
}

// ---------- tree helpers ----------

// Every non-group item inside a container, at any depth.
function leaves(container, out) {
  out = out || [];
  for (var i = 0; i < container.pageItems.length; i++) {
    var it = container.pageItems[i];
    if (it.typename === "GroupItem") leaves(it, out);
    else out.push(it);
  }
  return out;
}

// The item's ancestor that sits directly on the layer.
function topUnit(it) {
  while (it.parent && it.parent.typename !== "Layer") it = it.parent;
  return it;
}

function sameItem(a, b) { return a === b || (a && b && a.uuid && a.uuid === b.uuid); }
function indexOfItem(list, it) {
  for (var i = 0; i < list.length; i++) if (sameItem(list[i], it)) return i;
  return -1;
}

function hasText(unit) {
  if (unit.typename === "TextFrame") return true;
  if (unit.typename !== "GroupItem") return false;
  var l = leaves(unit);
  for (var i = 0; i < l.length; i++) if (l[i].typename === "TextFrame") return true;
  return false;
}

// Moves a group's children out to where the group is (keeping their stacking order), then deletes it.
function ungroup(group) {
  if (group.clipped) throw new PrepError("A clipping group mixes several rows together. Release it (Object → Clipping Mask → Release) and run this again.");
  while (group.pageItems.length > 0) group.pageItems[group.pageItems.length - 1].move(group, ElementPlacement.PLACEAFTER);
  group.remove();
}

// ---------- analysis of one artboard's layer ----------

function analyze(layer, abRect) {
  var abW = abRect[2] - abRect[0];
  var all = leaves(layer);
  var texts = [], lines = [], i, j;
  for (i = 0; i < all.length; i++) {
    if (all[i].typename === "TextFrame") texts.push(all[i]);
    else if (all[i].typename === "PathItem" && wd(all[i]) > abW * 0.4 && ht(all[i]) < 8) lines.push(all[i]);
  }

  var vs = [], times = [], date = null, others = [];
  for (i = 0; i < texts.length; i++) {
    var t = texts[i], s = t.contents;
    if (VS_RE.test(s)) vs.push(t);
    else if (TIME_RE.test(s)) times.push(t);
    else if (!date && DAY_RE.test(s)) date = t;
    else others.push(t);
  }
  if (vs.length < 2) throw new PrepError("Found " + vs.length + " \"VS\" texts; expected one per row (at least 2).");
  if (!date) throw new PrepError("Couldn't find the date text (something like \"SATURDAY, OCTOBER 3\").");
  vs.sort(function (a, b) { return cy(b) - cy(a); }); // top row first

  var n = vs.length;
  var pitch = (cy(vs[0]) - cy(vs[n - 1])) / (n - 1);
  var rows = [];
  for (i = 0; i < n; i++) {
    var y = cy(vs[i]), x = cx(vs[i]);
    var top = y + pitch / 2, bottom = y - pitch / 2;
    var row = { index: i, vs: vs[i], y: y, x: x, top: top, bottom: bottom, home: null, away: null, time: null, divider: null, homeLogo: null, awayLogo: null };
    var label = "row " + (i + 1);

    // Time: the time text closest to this VS.
    var best = null, bestD = 1e9;
    for (j = 0; j < times.length; j++) {
      var d = Math.abs(cy(times[j]) - y) + Math.abs(cx(times[j]) - x);
      if (cy(times[j]) <= top && cy(times[j]) >= bottom && d < bestD) { best = times[j]; bestD = d; }
    }
    if (!best) throw new PrepError("No time (like \"10:00 AM\") found near the VS of " + label + ".");
    row.time = best;

    // Team names: the remaining text nearest to VS on each side.
    var lBest = null, rBest = null;
    for (j = 0; j < others.length; j++) {
      var o = others[j], oy = cy(o), ox = cx(o);
      if (oy > top || oy < bottom) continue;
      if (wd(o) > abW * 0.4 || ht(o) > pitch * 1.5) continue; // titles etc. are much bigger than a team name
      if (ox < x && (!lBest || ox > cx(lBest))) lBest = o;
      if (ox > x && (!rBest || ox < cx(rBest))) rBest = o;
    }
    if (!lBest || !rBest) throw new PrepError("Couldn't find both team names in " + label + ".");
    row.home = lBest;
    row.away = rBest;

    // Divider: the highest long line below this VS (and above the next row's VS).
    var nextY = i < n - 1 ? cy(vs[i + 1]) : -1e9;
    for (j = 0; j < lines.length; j++) {
      var ly = cy(lines[j]);
      if (ly < y && ly > nextY && (!row.divider || ly > cy(row.divider))) row.divider = lines[j];
    }
    rows.push(row);
  }

  // Logos: textless art on the layer, inside a row's band, outside the team names.
  for (i = 0; i < layer.pageItems.length; i++) {
    var u = layer.pageItems[i];
    if (hasText(u) || wd(u) > abW * 0.4) continue;
    for (j = 0; j < rows.length; j++) {
      var r = rows[j], uy = cy(u), ux = cx(u);
      if (uy > r.top || uy < r.bottom) continue;
      if (r.divider && sameItem(topUnit(r.divider), u)) continue;
      if (ux < cx(r.home) && (!r.homeLogo || ux < cx(r.homeLogo))) r.homeLogo = u;
      if (ux > cx(r.away) && (!r.awayLogo || ux > cx(r.awayLogo))) r.awayLogo = u;
    }
  }

  return { rows: rows, date: date, pitch: pitch };
}

function rowPieces(row) {
  var p = [row.home, row.away, row.vs, row.time];
  if (row.divider) p.push(row.divider);
  if (row.homeLogo) p.push(row.homeLogo);
  if (row.awayLogo) p.push(row.awayLogo);
  return p;
}

// If a group holds pieces of more than one row (or the date), ungroup it. Returns true if it changed anything.
function untangle(info) {
  var owners = [], units = [], k, i;
  for (i = 0; i < info.rows.length; i++) {
    var pieces = rowPieces(info.rows[i]);
    for (k = 0; k < pieces.length; k++) {
      var u = topUnit(pieces[k]);
      var at = indexOfItem(units, u);
      if (at === -1) { units.push(u); owners.push(i); }
      else if (owners[at] !== i && u.typename === "GroupItem") { ungroup(u); return true; }
    }
  }
  var dateUnit = topUnit(info.date);
  if (dateUnit.typename === "GroupItem" && indexOfItem(units, dateUnit) !== -1) { ungroup(dateUnit); return true; }
  for (i = 0; i < units.length; i++) {
    if (units[i].typename === "GroupItem" && ht(units[i]) > info.pitch * 1.5) { ungroup(units[i]); return true; }
  }
  return false;
}

// ---------- building the prepared version ----------

function prepareVersion(layer, abRect, notes, label) {
  var info, guard = 0;
  do {
    info = analyze(layer, abRect);
    if (++guard > 50) throw new PrepError("The rows are grouped in a way this script can't untangle.");
  } while (untangle(info));

  var rows = info.rows, n = rows.length, pitch = info.pitch, i, k;
  var first = rows[0];

  // One standard logo box, sized from all the logos so every team gets the same space.
  var ws = [], hs = [], leftX = [], rightX = [], dy = [];
  for (i = 0; i < n; i++) {
    if (rows[i].homeLogo) { ws.push(wd(rows[i].homeLogo)); hs.push(ht(rows[i].homeLogo)); leftX.push(cx(rows[i].homeLogo)); dy.push(cy(rows[i].homeLogo) - rows[i].y); }
    if (rows[i].awayLogo) { ws.push(wd(rows[i].awayLogo)); hs.push(ht(rows[i].awayLogo)); rightX.push(cx(rows[i].awayLogo)); dy.push(cy(rows[i].awayLogo) - rows[i].y); }
  }
  if (!ws.length) throw new PrepError("No logos found in any row, so there's no logo position to copy. Place one logo on each side of row 1 and run again.");
  var boxW = percentile(ws, 0.75), boxH = percentile(hs, 0.75);
  var boxY = first.y + median(dy);
  // A side with no logo anywhere mirrors the other side across VS.
  var homeX = leftX.length ? median(leftX) : 2 * first.x - median(rightX);
  var awayX = rightX.length ? median(rightX) : 2 * first.x - median(leftX);

  // Group row 1's pieces (top-level units, in their stacking order) as MATCH_ROW.
  var units = [];
  var pieces = rowPieces(first);
  for (k = 0; k < pieces.length; k++) if (indexOfItem(units, topUnit(pieces[k])) === -1) units.push(topUnit(pieces[k]));
  var group = layer.groupItems.add();
  var ordered = [];
  for (i = 0; i < layer.pageItems.length; i++) if (indexOfItem(units, layer.pageItems[i]) !== -1) ordered.push(layer.pageItems[i]);
  group.move(ordered[0], ElementPlacement.PLACEBEFORE);
  for (i = 0; i < ordered.length; i++) ordered[i].move(group, ElementPlacement.PLACEATEND);
  group.name = "MATCH_ROW";

  first.home.name = "HOME_NAME";
  first.away.name = "AWAY_NAME";
  first.time.name = "TIME";

  // Swap row 1's logos for empty boxes (same spot in the stacking order).
  var sides = [["HOME_LOGO", first.homeLogo, homeX], ["AWAY_LOGO", first.awayLogo, awayX]];
  for (k = 0; k < 2; k++) {
    var box = group.pathItems.rectangle(boxY + boxH / 2, sides[k][2] - boxW / 2, boxW, boxH);
    box.filled = false;
    box.stroked = false;
    box.name = sides[k][0];
    if (sides[k][1]) {
      box.move(sides[k][1], ElementPlacement.PLACEBEFORE);
      sides[k][1].remove();
    }
  }

  info.date.name = "DATE";

  // Rows area: n equal slots centered on the rows' VS texts.
  var left = abRect[0], right = abRect[2];
  if (first.divider) { left = bnds(first.divider)[0]; right = bnds(first.divider)[2]; }
  var area = layer.pathItems.rectangle(first.y + pitch / 2, left, right - left, n * pitch);
  area.filled = false;
  area.stroked = false;
  area.name = "ROWS_AREA";

  // Delete rows 2..n.
  for (i = 1; i < n; i++) {
    var gone = [];
    pieces = rowPieces(rows[i]);
    for (k = 0; k < pieces.length; k++) {
      var u = topUnit(pieces[k]);
      if (indexOfItem(gone, u) === -1) gone.push(u);
    }
    for (k = 0; k < gone.length; k++) gone[k].remove();
  }

  var logoCount = ws.length;
  notes.push(label + ": " + n + " rows, " + logoCount + " logos" + (first.divider ? "" : ", no divider line found under row 1"));
  return n;
}

function versionName(abRect, used) {
  var w = abRect[2] - abRect[0], h = abRect[1] - abRect[3];
  var name = h / w >= 1.5 ? "STORY" : h / w >= 1.1 ? "PORTRAIT" : h / w > 0.9 ? "SQUARE" : "LANDSCAPE";
  var candidate = name, k = 2;
  while (used[candidate]) candidate = name + " " + k++;
  used[candidate] = true;
  return candidate;
}

function prepare(doc) {
  var i, l, notes = [], counts = [];
  for (l = 0; l < doc.layers.length; l++) {
    for (i = 0; i < doc.layers[l].pageItems.length; i++) {
      if (doc.layers[l].pageItems[i].name === "MATCH_ROW") throw new PrepError("This template already looks prepared (it has a MATCH_ROW). Use check-template.jsx instead.");
    }
  }

  // Unlock and show everything so it can be moved.
  for (l = 0; l < doc.layers.length; l++) { doc.layers[l].locked = false; doc.layers[l].visible = true; }
  try { app.executeMenuCommand("unlockAll"); app.executeMenuCommand("showAll"); } catch (ignore) {}

  var sourceLayers = [];
  for (l = 0; l < doc.layers.length; l++) sourceLayers.push(doc.layers[l]);

  var used = {};
  for (var a = 0; a < doc.artboards.length; a++) {
    var rect = doc.artboards[a].artboardRect;
    var name = versionName(rect, used);

    // Collect this artboard's top-level art (bottom-most first) and move it to a new layer.
    var units = [];
    for (l = sourceLayers.length - 1; l >= 0; l--) {
      var src = sourceLayers[l];
      for (i = src.pageItems.length - 1; i >= 0; i--) {
        var it = src.pageItems[i];
        if (inRect(cx(it), cy(it), rect)) units.push(it);
      }
    }
    if (!units.length) { notes.push(name + ": artboard is empty, skipped"); continue; }
    var layer = doc.layers.add();
    layer.name = name;
    for (i = 0; i < units.length; i++) units[i].move(layer, ElementPlacement.PLACEATBEGINNING);

    try {
      counts.push(prepareVersion(layer, rect, notes, name));
    } catch (e) {
      if (e instanceof PrepError) throw new PrepError(name + " artboard: " + e.message);
      throw e;
    }
  }

  // Remove the original layers if they're now empty.
  for (l = 0; l < sourceLayers.length; l++) {
    if (sourceLayers[l].pageItems.length === 0 && sourceLayers[l].layers.length === 0) sourceLayers[l].remove();
  }
  return { notes: notes, counts: counts };
}

function run() {
  if (app.documents.length === 0) { alert("Open the template first, then run this script again."); return; }
  var doc = app.activeDocument;
  var file = null;
  try { if (doc.path && String(doc.path) !== "") file = doc.fullName; } catch (ignore) {} // null for never-saved docs

  if (!confirm("Prepare \"" + doc.name + "\" for the Match Generator?\n\nA backup copy is saved next to it first.")) return;

  var backupNote = "";
  if (file && file.exists) {
    var stamp = new Date();
    var backup = new File(file.parent + "/" + file.name.replace(/\.ai$/i, "") + "-backup-" + stamp.getFullYear() + (stamp.getMonth() + 1) + stamp.getDate() + "-" + stamp.getHours() + stamp.getMinutes() + ".ai");
    if (file.copy(backup)) backupNote = "\nBackup of the original: " + backup.name;
  }

  var result;
  try {
    result = prepare(doc);
  } catch (e) {
    alert("Couldn't finish preparing the template:\n\n" + e.message + "\n\nNothing was saved. Use File → Revert to undo the partial changes, fix that spot by hand, and run this again." + backupNote);
    return;
  }

  var rowNote = "";
  for (var i = 0; i < result.counts.length; i++) {
    if (result.counts[i] !== 8) rowNote = "\n\nNote: a version has " + result.counts[i] + " rows. Set \"templateRowCount\" in ~/MatchGenerator/config.json to match.";
  }
  if (file) doc.save();
  alert("Template prepared and saved." + backupNote + "\n\n• " + result.notes.join("\n• ") + rowNote + "\n\nNow checking it…");

  // Run the regular checker so the designer sees the same final verdict.
  var checker = new File(new File($.fileName).parent + "/check-template.jsx");
  if (checker.exists) $.evalFile(checker);
}

if (typeof PREPARE_TEST === "undefined") run();
