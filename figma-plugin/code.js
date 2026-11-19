// Tokiwa Sell Sheets: copies the "Sell sheet auto" frame once per product in a batch from the
// dashboard (/hrs) and fills in its #-named layers. The UI (ui.html) does the network calls and
// passes the batch plus photo bytes here.

const TEMPLATE_NAME = "Sell sheet auto";
const GAP_BETWEEN_SHEETS = 100;

// Dashboard field → value layer. A "#x-label" layer next to it is hidden with it when blank.
const STATS = {
  abv: "abv",
  size: "size",
  age: "age",
  style: "style",
  adjustments: "adjustments",
  release: "release",
  peat: "peat",
  still: "still",
  bottling: "bottling",
  barrels: "barrels",
  bottleCount: "bottle-count",
};

// ---------------------------------------------------------------------------------------------
// Filling one sheet. Kept free of figma.ui so it can be run on its own.

async function loadFonts(node) {
  const fonts = node.characters.length ? node.getRangeAllFontNames(0, node.characters.length) : [node.fontName];
  for (const f of fonts) {
    try {
      await figma.loadFontAsync(f);
    } catch (e) {
      throw new Error(`The font "${f.family} ${f.style}" isn't available on this computer. Install it and run the plugin again.`);
    }
  }
}

/** Replaces the text, keeping the layer's style and width; the height follows the text. */
async function setText(node, value, autoResize = "HEIGHT") {
  await loadFonts(node);
  node.textAutoResize = autoResize;
  node.characters = value;
}

/**
 * Sets the text and shrinks it until it takes at most as many lines as the template's sample did
 * (plus `extraLines`). Counts lines rather than pixels because the template's boxes are shorter
 * than one line at its 190% line height.
 */
async function setTextLines(node, value, { extraLines = 0, minSize = 11 } = {}) {
  await loadFonts(node);
  node.textAutoResize = "HEIGHT";
  const sample = node.characters;
  const startSize = typeof node.fontSize === "number" ? node.fontSize : null;
  node.characters = "X";
  const oneLine = node.height;
  node.characters = sample || "X";
  const maxLines = Math.max(1, Math.round(node.height / oneLine)) + extraLines;
  node.characters = value;
  if (startSize === null) return true;
  let size = startSize;
  const fits = () => node.height <= (oneLine * size) / startSize * maxLines + 1;
  while (!fits() && size > minSize) {
    size = Math.max(minSize, size - 0.5);
    node.fontSize = size;
  }
  return fits();
}

/** Shrinks the font in half-point steps until the text fits maxHeight. Returns false if it never does. */
function shrinkToFit(node, maxHeight, minSize) {
  if (typeof node.fontSize !== "number") return node.height <= maxHeight + 0.5;
  let size = node.fontSize;
  while (node.height > maxHeight + 0.5 && size > minSize) {
    size = Math.max(minSize, size - 0.5);
    node.fontSize = size;
  }
  return node.height <= maxHeight + 0.5;
}

async function fillSheet(frame, fields, photoBytes) {
  const warnings = [];
  const label = fields.name || "Untitled";
  const find = (name) => frame.findOne((n) => n.name === name);
  const need = (name) => {
    const n = find(name);
    if (!n) throw new Error(`The template has no "${name}" layer. Was it renamed?`);
    return n;
  };
  const blank = (v) => !v || !String(v).trim();

  // --- Left column: title, region, description, tasting notes flow top to bottom.
  const title = need("#name");
  const region = need("#region");
  const description = need("#description");
  const tasting = ["#tasting-title", "#tasting-arrow", "#tasting-line", "#tasting-notes"].map(need);
  const [tastingTitle, , , tastingNotes] = tasting;
  const statsTop = need("#abv-label").y;

  // Gaps measured from the template before anything changes.
  const gapTitleRegion = region.y - (title.y + title.height);
  const gapRegionDesc = description.y - (region.y + region.height);
  const gapDescTasting = tastingTitle.y - (description.y + description.height);
  const tastingOffsets = tasting.map((n) => n.y - tastingTitle.y);
  const gapNotesStats = statsTop - (tastingNotes.y + tastingNotes.height);
  const bottomLimit = statsTop - Math.min(gapNotesStats, 40);

  await setText(title, fields.name || "Untitled");
  const hasRegion = !blank(fields.region);
  region.visible = hasRegion;
  if (hasRegion) await setText(region, fields.region, "WIDTH_AND_HEIGHT");
  await setText(description, fields.description || "");
  const hasTasting = !blank(fields.tastingNotes);
  for (const n of tasting) n.visible = hasTasting;
  if (hasTasting) {
    await setText(tastingTitle, "Tasting Notes", "WIDTH_AND_HEIGHT");
    await setText(tastingNotes, fields.tastingNotes);
  }

  const layoutLeft = () => {
    let y = title.y + title.height + gapTitleRegion;
    if (hasRegion) {
      region.y = y;
      y = region.y + region.height + gapRegionDesc;
    }
    description.y = y;
    let bottom = description.y + description.height;
    if (hasTasting) {
      const top = bottom + gapDescTasting;
      tasting.forEach((n, i) => (n.y = top + tastingOffsets[i]));
      bottom = tastingNotes.y + tastingNotes.height;
    }
    return bottom;
  };

  // Too much text: shrink the description and tasting notes together until it all fits.
  let bottom = layoutLeft();
  let size = typeof description.fontSize === "number" ? description.fontSize : 14;
  const startSize = size;
  while (bottom > bottomLimit && size > 11) {
    size -= 0.5;
    description.fontSize = size;
    if (hasTasting && typeof tastingNotes.fontSize === "number") tastingNotes.fontSize = size;
    bottom = layoutLeft();
  }
  if (bottom > bottomLimit) warnings.push(`${label}: the description is too long to fit even at ${size}pt. Shorten it.`);
  else if (size < startSize) warnings.push(`${label}: description shrunk to ${size}pt to fit.`);

  // --- Stats: value + label pairs. Blank → both hidden. Values may wrap a little, then shrink.
  for (const [key, layer] of Object.entries(STATS)) {
    const value = need(`#${layer}`);
    const lab = find(`#${layer}-label`);
    const show = !blank(fields[key]);
    value.visible = show;
    if (lab) lab.visible = show;
    if (!show) continue;
    const ok = await setTextLines(value, fields[key], { extraLines: key === "barrels" ? 1 : 0 });
    if (!ok) warnings.push(`${label}: "${fields[key]}" is too long for ${lab ? lab.characters : layer}.`);
  }

  // Short left column (e.g. no tasting notes): lift the whole stats block up so it sits under the
  // text with the template's spacing instead of leaving a hole.
  const lift = statsTop - (bottom + gapNotesStats);
  if (lift > 1) {
    for (const layer of Object.values(STATS)) {
      for (const n of [find(`#${layer}`), find(`#${layer}-label`)]) if (n) n.y -= lift;
    }
  }

  // --- Distillery box.
  const distName = need("#distillery-name");
  const distAbout = need("#distillery-about");
  const website = find("#website");
  await setTextLines(distName, fields.distilleryName || "", { minSize: 28 });
  const aboutLimit = (website ? website.y - 20 : distAbout.y + distAbout.height * 1.3) - distAbout.y;
  await setText(distAbout, fields.distilleryAbout || "");
  if (!shrinkToFit(distAbout, aboutLimit, 10)) warnings.push(`${label}: the distillery text is too long to fit. Shorten it.`);

  // --- Map label, with its little arrow following the text.
  const mapLabel = find("#map-label");
  if (mapLabel) {
    const arrow = find("#map-arrow");
    const show = !blank(fields.mapLabel);
    mapLabel.visible = show;
    if (arrow) arrow.visible = show;
    if (show) {
      await setText(mapLabel, fields.mapLabel, "WIDTH_AND_HEIGHT");
      if (arrow) arrow.x = mapLabel.x + mapLabel.width + 4;
    }
  }

  // --- Bottle photo.
  const photo = need("#photo");
  if (photoBytes && photoBytes.length) {
    const image = figma.createImage(photoBytes);
    photo.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FIT" }];
  } else {
    photo.fills = [{ type: "SOLID", color: { r: 0.93, g: 0.93, b: 0.93 } }];
    warnings.push(`${label}: no bottle photo.`);
  }

  frame.name = `Sell sheet – ${label}`;
  return warnings;
}

// ---------------------------------------------------------------------------------------------
// Batches

async function findTemplate() {
  const isTemplate = (n) => n.type === "FRAME" && n.name === TEMPLATE_NAME;
  const here = figma.currentPage.findOne(isTemplate);
  if (here) return here;
  for (const page of figma.root.children) {
    if (page === figma.currentPage) continue;
    await page.loadAsync();
    const found = page.findOne(isTemplate);
    if (found) {
      await figma.setCurrentPageAsync(page);
      return found;
    }
  }
  throw new Error(`No frame named "${TEMPLATE_NAME}" in this file. Open the TOKIWA file (or rename your template frame).`);
}

/** Copies the template once per sheet, in a row to the right of everything on the page. */
async function createBatch(batch, photos) {
  const template = await findTemplate();
  const page = figma.currentPage;
  let x = Math.max(...page.children.map((n) => n.x + n.width)) + 200;
  const created = [];
  const warnings = [];
  for (const [i, sheet] of batch.sheets.entries()) {
    figma.ui.postMessage({ type: "progress", text: `Creating ${i + 1} of ${batch.sheets.length}: ${sheet.fields.name}` });
    const frame = template.clone();
    page.appendChild(frame);
    frame.x = x;
    frame.y = template.y;
    x += frame.width + GAP_BETWEEN_SHEETS;
    created.push(frame);
    try {
      warnings.push(...(await fillSheet(frame, sheet.fields, photos[i])));
    } catch (e) {
      // Leave nothing half-made behind.
      for (const f of created) f.remove();
      throw e;
    }
  }
  page.selection = created;
  figma.viewport.scrollAndZoomIntoView(created);
  return { count: created.length, warnings };
}

// ---------------------------------------------------------------------------------------------
// UI messages

figma.showUI(__html__, { width: 380, height: 560, themeColors: true });

figma.ui.onmessage = async (msg) => {
  if (msg.type === "load-settings") {
    const settings = (await figma.clientStorage.getAsync("settings")) || {};
    figma.ui.postMessage({ type: "settings", settings });
  } else if (msg.type === "save-settings") {
    await figma.clientStorage.setAsync("settings", msg.settings);
  } else if (msg.type === "create") {
    try {
      const result = await createBatch(msg.batch, msg.photos);
      figma.ui.postMessage({ type: "created", id: msg.batch.id, ...result });
    } catch (e) {
      figma.ui.postMessage({ type: "failed", id: msg.batch.id, error: e instanceof Error ? e.message : String(e) });
    }
  } else if (msg.type === "close") {
    figma.closePlugin();
  }
};
