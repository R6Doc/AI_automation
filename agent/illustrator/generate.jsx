// generate.jsx: fills the match template. Run by the agent via AppleScript `do javascript`.
// arguments[0] = path to job.json written by the agent (already validated).
//
// Template contract (see TEMPLATE_SETUP.md). Each version of the graphic (e.g. Story and
// Portrait) lives on its own top-level layer, and each such layer contains:
//   DATE       text frame for the header date
//   ROWS_AREA  rectangle drawn exactly around the template's rows as designed
//   MATCH_ROW  group holding ONE match row (incl. its divider), with named children:
//                HOME_NAME, AWAY_NAME, TIME   text frames
//                HOME_LOGO, AWAY_LOGO         logo boxes (a rectangle, or an existing logo)
//
// ExtendScript is ES3: no JSON, no let/const, no arrow functions.

function readJob(path) {
  var f = new File(path);
  f.encoding = "UTF-8";
  if (!f.open("r")) throw new Error("Can't read job file: " + path);
  var text = f.read();
  f.close();
  // The agent writes this file with JSON.stringify from validated data.
  return eval("(" + text + ")");
}

function toJson(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (typeof value === "string") {
    return '"' + value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n") + '"';
  }
  var parts = [], k;
  if (value instanceof Array) {
    for (k = 0; k < value.length; k++) parts.push(toJson(value[k]));
    return "[" + parts.join(",") + "]";
  }
  for (k in value) if (value.hasOwnProperty(k)) parts.push(toJson(k) + ":" + toJson(value[k]));
  return "{" + parts.join(",") + "}";
}

// Depth-first search for a named page item inside a container (document, layer or group).
function findByName(container, name) {
  var i, item, found;
  var items = container.pageItems;
  for (i = 0; i < items.length; i++) {
    item = items[i];
    if (item.name === name) return item;
    if (item.typename === "GroupItem") {
      found = findByName(item, name);
      if (found) return found;
    }
  }
  if (container.typename === "Document" || container.typename === "Layer") {
    for (i = 0; i < container.layers.length; i++) {
      found = findByName(container.layers[i], name);
      if (found) return found;
    }
  }
  return null;
}

function requireItem(container, name, where) {
  var item = findByName(container, name);
  if (!item) throw new Error("The template is missing \"" + name + "\"" + (where ? " inside " + where : "") + ". See TEMPLATE_SETUP.md.");
  if (item.locked) throw new Error("\"" + name + "\" is locked in the template. Unlock it and save the template.");
  return item;
}

// bounds = [left, top, right, bottom]; in Illustrator, y grows upward so top > bottom.
function centerY(item) {
  var b = item.geometricBounds;
  return (b[1] + b[3]) / 2;
}

// Replaces text while keeping the frame vertically centered where it was, so 1-line and
// 3-line names sit on the same axis. Horizontal alignment (left/right) is kept by the frame itself.
function setTextCentered(frame, text) {
  var before = centerY(frame);
  frame.contents = text;
  frame.translate(0, before - centerY(frame));
}

// Scales `item` to fit inside `box` bounds (keeping proportions) and centers it there.
function fitInto(item, box) {
  var bw = box[2] - box[0], bh = box[1] - box[3];
  var b = item.geometricBounds;
  var w = b[2] - b[0], h = b[1] - b[3];
  if (w <= 0 || h <= 0) return;
  var s = Math.min(bw / w, bh / h) * 100;
  item.resize(s, s, true, true, true, true, s, Transformation.CENTER);
  b = item.geometricBounds;
  item.translate((box[0] + box[2]) / 2 - (b[0] + b[2]) / 2, (box[1] + box[3]) / 2 - (b[1] + b[3]) / 2);
}

function placeLogo(row, placeholderName, logoPath, warnings, teamName) {
  var placeholder = requireItem(row, placeholderName, "MATCH_ROW");
  var box = placeholder.geometricBounds;
  if (logoPath) {
    var file = new File(logoPath);
    try {
      if (/\.svg$/i.test(logoPath)) {
        var group = row.groupItems.createFromFile(file); // SVG → editable vector artwork
        fitInto(group, box);
        group.move(placeholder, ElementPlacement.PLACEBEFORE);
        group.name = placeholderName;
      } else {
        var placed = row.placedItems.add();
        placed.file = file;
        fitInto(placed, box);
        placed.move(placeholder, ElementPlacement.PLACEBEFORE);
        placed.name = placeholderName;
        placed.embed(); // don't leave a link to the agent's cache folder
      }
    } catch (e) {
      warnings.push("Couldn't place the " + teamName + " logo (" + e.message + ").");
    }
  }
  placeholder.remove();
}

function fillRow(row, match, warnings) {
  setTextCentered(requireItem(row, "HOME_NAME", "MATCH_ROW"), match.home.lines.join("\r"));
  setTextCentered(requireItem(row, "AWAY_NAME", "MATCH_ROW"), match.away.lines.join("\r"));
  requireItem(row, "TIME", "MATCH_ROW").contents = match.time;
  placeLogo(row, "HOME_LOGO", match.home.logoPath, warnings, match.home.name);
  placeLogo(row, "AWAY_LOGO", match.away.logoPath, warnings, match.away.name);
}

// Fills one version of the graphic. `scope` is the layer holding that version.
function fillVersion(scope, job, warnings) {
  var where = "layer \"" + scope.name + "\"";
  if (scope.locked) throw new Error("Layer \"" + scope.name + "\" is locked in the template. Unlock it and save the template.");
  requireItem(scope, "DATE", where).contents = job.dateLabel;
  var proto = requireItem(scope, "MATCH_ROW", where);
  var area = requireItem(scope, "ROWS_AREA", where);
  if (proto.typename !== "GroupItem") throw new Error("MATCH_ROW must be a group.");

  var n = job.matches.length;
  var designed = job.templateRowCount;
  var a = area.geometricBounds;
  var areaTop = a[1], areaH = a[1] - a[3];
  var naturalPitch = areaH / designed;

  // Where the prototype sits inside its cell, so copies keep the designer's exact offset.
  var protoCenter = centerY(proto);
  var cell = Math.max(0, Math.min(designed - 1, Math.round((areaTop - protoCenter) / naturalPitch - 0.5)));
  var offset = protoCenter - (areaTop - (cell + 0.5) * naturalPitch);

  // Up to the designed count: natural spacing, block centered in the area.
  // More than that: squeeze rows to fit, scaling them down.
  var pitch = n <= designed ? naturalPitch : areaH / n;
  var scale = pitch / naturalPitch;
  var blockTop = areaTop - (areaH - n * pitch) / 2;

  // Position each copy while it's still identical to the prototype, then fill it. Measuring
  // after filling would let a 3-line name nudge its row off the grid.
  for (var i = 0; i < n; i++) {
    var row = proto.duplicate(proto, ElementPlacement.PLACEBEFORE);
    row.name = "MATCH_" + (i + 1);
    if (scale < 1) row.resize(scale * 100, scale * 100, true, true, true, true, scale * 100, Transformation.CENTER);
    var target = blockTop - (i + 0.5) * pitch + offset * scale;
    row.translate(0, target - protoCenter);
    fillRow(row, job.matches[i], warnings);
  }

  proto.remove();
  area.remove();
}

function main(jobPath) {
  var warnings = [];
  var doc = null;
  var job = null;
  var previousLevel = app.userInteractionLevel;
  app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
  try {
    job = readJob(jobPath);
    doc = app.open(new File(job.templatePath));
    // Save the copy first: from here on we only ever touch the output file, never the template.
    var opts = new IllustratorSaveOptions();
    opts.pdfCompatible = true;
    doc.saveAs(new File(job.outputPath), opts);

    // Every top-level layer with a MATCH_ROW is one version; all get the same matches.
    var versions = [];
    for (var l = 0; l < doc.layers.length; l++) {
      if (findByName(doc.layers[l], "MATCH_ROW")) versions.push(doc.layers[l]);
    }
    if (!versions.length) throw new Error("The template has no MATCH_ROW. See TEMPLATE_SETUP.md.");
    for (var v = 0; v < versions.length; v++) fillVersion(versions[v], job, warnings);

    doc.save();
    return toJson({ ok: true, file: job.outputPath, warnings: warnings });
  } catch (e) {
    if (doc) {
      try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (ignore) {}
      try { new File(job.outputPath).remove(); } catch (ignore2) {}
    }
    return toJson({ ok: false, error: e.message + (e.line ? " (line " + e.line + ")" : "") });
  } finally {
    app.userInteractionLevel = previousLevel;
  }
}

main(arguments[0]);
