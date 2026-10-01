// check-template.jsx: run manually in Illustrator (File → Scripts → Other Script…) with the
// template open. Confirms the template has everything generate.jsx needs, and writes the full
// object tree to template-structure.json on the Desktop for troubleshooting.

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
  var ok = [];
  function check(container, name, where, type) {
    var item = find(container, name);
    if (!item) problems.push("Missing: " + name + (where ? " (inside " + where + ")" : ""));
    else if (type && item.typename !== type) problems.push(name + " should be a " + type + " but is a " + item.typename);
    else if (item.locked || item.hidden) problems.push(name + " is locked or hidden");
    else ok.push(name);
    return item;
  }

  if (doc.artboards.length !== 1) problems.push("The template should have exactly 1 artboard (it has " + doc.artboards.length + ").");
  check(doc, "DATE", null, "TextFrame");
  check(doc, "ROWS_AREA", null, "PathItem");
  var row = check(doc, "MATCH_ROW", null, "GroupItem");
  if (row && row.typename === "GroupItem") {
    check(row, "HOME_NAME", "MATCH_ROW", "TextFrame");
    check(row, "AWAY_NAME", "MATCH_ROW", "TextFrame");
    check(row, "TIME", "MATCH_ROW", "TextFrame");
    check(row, "HOME_LOGO", "MATCH_ROW");
    check(row, "AWAY_LOGO", "MATCH_ROW");
  }

  // Dump the object tree.
  function describe(item, depth) {
    var b = item.geometricBounds;
    var line = new Array(depth + 1).join("  ") + item.typename + (item.name ? ' "' + item.name + '"' : "") +
      " [" + Math.round(b[0]) + ", " + Math.round(b[1]) + ", " + Math.round(b[2]) + ", " + Math.round(b[3]) + "]";
    if (item.typename === "TextFrame") line += ' text="' + item.contents.replace(/\r/g, " / ") + '"';
    var out = [line];
    if (item.typename === "GroupItem") for (var i = 0; i < item.pageItems.length; i++) out = out.concat(describe(item.pageItems[i], depth + 1));
    return out;
  }
  var lines = ["Document: " + doc.name, "Artboards: " + doc.artboards.length];
  for (var l = 0; l < doc.layers.length; l++) {
    lines.push("Layer \"" + doc.layers[l].name + "\"");
    for (var p = 0; p < doc.layers[l].pageItems.length; p++) lines = lines.concat(describe(doc.layers[l].pageItems[p], 1));
  }
  var f = new File(Folder.desktop + "/template-structure.txt");
  f.encoding = "UTF-8";
  f.open("w");
  f.write(lines.join("\n"));
  f.close();

  alert(
    (problems.length ? "Template needs fixes:\n\n• " + problems.join("\n• ") : "Template looks good! All " + ok.length + " named items found.") +
      "\n\nFull structure saved to Desktop/template-structure.txt"
  );
})();
