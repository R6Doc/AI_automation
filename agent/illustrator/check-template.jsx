// check-template.jsx: run manually in Illustrator (File → Scripts → Other Script…) with the
// template open. Confirms the template has everything generate.jsx needs, and writes the full
// object tree to template-structure.txt on the Desktop for troubleshooting.

(function () {
  if (app.documents.length === 0) {
    alert("Open the template first, then run this script again.");
    return;
  }
  var doc = app.activeDocument;

  function find(container, name) {
    var i, item, found;
    for (i = 0; i < container.pageItems.length; i++) {
      item = container.pageItems[i];
      if (item.name === name) return item;
      if (item.typename === "GroupItem" && (found = find(item, name))) return found;
    }
    if (container.typename === "Document" || container.typename === "Layer") for (i = 0; i < container.layers.length; i++) if ((found = find(container.layers[i], name))) return found;
    return null;
  }

  var problems = [];
  var versions = [];
  function check(container, name, where, type) {
    var item = find(container, name);
    if (!item) problems.push("Missing: " + name + " (in " + where + ")");
    else if (type && item.typename !== type) problems.push(name + " in " + where + " should be a " + type + " but is a " + item.typename);
    else if (item.locked || item.hidden) problems.push(name + " in " + where + " is locked or hidden");
    return item;
  }

  // Each top-level layer with any of our names is one version of the graphic.
  var names = ["DATE", "ROWS_AREA", "MATCH_ROW"];
  for (var l = 0; l < doc.layers.length; l++) {
    var layer = doc.layers[l];
    var used = false;
    for (var n = 0; n < names.length; n++) if (find(layer, names[n])) used = true;
    if (!used) continue;
    var where = "layer \"" + layer.name + "\"";
    versions.push(layer.name);
    if (layer.locked || !layer.visible) problems.push("Layer \"" + layer.name + "\" is locked or hidden");
    check(layer, "DATE", where, "TextFrame");
    check(layer, "ROWS_AREA", where, "PathItem");
    var row = check(layer, "MATCH_ROW", where, "GroupItem");
    if (row && row.typename === "GroupItem") {
      var inRow = "MATCH_ROW of " + where;
      check(row, "HOME_NAME", inRow, "TextFrame");
      check(row, "AWAY_NAME", inRow, "TextFrame");
      check(row, "TIME", inRow, "TextFrame");
      check(row, "HOME_LOGO", inRow);
      check(row, "AWAY_LOGO", inRow);
    }
  }
  if (!versions.length) problems.push("No layer contains DATE, ROWS_AREA or MATCH_ROW yet.");

  // Dump the object tree.
  function describe(item, depth) {
    var b = item.geometricBounds;
    var line = new Array(depth + 1).join("  ") + item.typename + (item.name ? ' "' + item.name + '"' : "") +
      " [" + Math.round(b[0]) + ", " + Math.round(b[1]) + ", " + Math.round(b[2]) + ", " + Math.round(b[3]) + "]";
    if (item.typename === "TextFrame") line += " " + item.kind + ' text="' + item.contents.replace(/\r/g, " / ") + '"';
    var out = [line];
    if (item.typename === "GroupItem") for (var i = 0; i < item.pageItems.length; i++) out = out.concat(describe(item.pageItems[i], depth + 1));
    return out;
  }
  var lines = ["Document: " + doc.name, "Artboards: " + doc.artboards.length];
  for (var a = 0; a < doc.artboards.length; a++) {
    var r = doc.artboards[a].artboardRect;
    lines.push("  " + doc.artboards[a].name + " " + Math.round(r[2] - r[0]) + "x" + Math.round(r[1] - r[3]));
  }
  for (var k = 0; k < doc.layers.length; k++) {
    lines.push("Layer \"" + doc.layers[k].name + "\"");
    for (var p = 0; p < doc.layers[k].pageItems.length; p++) lines = lines.concat(describe(doc.layers[k].pageItems[p], 1));
  }
  var f = new File(Folder.desktop + "/template-structure.txt");
  f.encoding = "UTF-8";
  f.open("w");
  f.write(lines.join("\n"));
  f.close();

  alert(
    (problems.length
      ? "Template needs fixes:\n\n• " + problems.join("\n• ")
      : "Template looks good! Versions found: " + versions.join(", ") + ".") +
      "\n\nFull structure saved to Desktop/template-structure.txt"
  );
})();
