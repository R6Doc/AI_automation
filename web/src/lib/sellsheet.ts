/**
 * Turns a product docx (the "compare" format) into the fields of the TOKIWA sell sheet.
 *
 * The docx looks like:
 *   <product name>
 *   Bottle Size: 700ml / ABV Percentage: 43% / Style / Age Statement / Peat / Barrels Used to Age / Special note
 *   <product name again>
 *   <description paragraph(s)>
 *   From Hombo San:            ← quote, goes into the description
 *   "…"
 *   Tasting Notes:             ← only when present; never filled from anything else
 *   About Mars Whisky:
 *   Mars Whisky                ← distillery name
 *   <about paragraph(s)>
 *
 * Pure string code (no DOM) so it runs in the browser and in `node --experimental-strip-types`.
 */

export type SheetFields = {
  name: string;
  region: string;
  description: string;
  tastingNotes: string;
  abv: string;
  size: string;
  age: string;
  style: string;
  adjustments: string;
  release: string;
  peat: string;
  still: string;
  bottling: string;
  barrels: string;
  bottleCount: string;
  specialNote: string;
  extras: string;
  distilleryName: string;
  distilleryAbout: string;
  mapLabel: string;
};

export type FieldKey = keyof SheetFields;

export type FieldDef = {
  key: FieldKey;
  label: string;
  /** Shown as a textarea. */
  long?: boolean;
  /** Not placed on the sheet (kept for reference). */
  offSheet?: boolean;
  /** Left blank → the value and its label are hidden on the sheet. */
  hideWhenBlank?: boolean;
  placeholder?: string;
};

export const FIELD_DEFS: FieldDef[] = [
  { key: "name", label: "Product name" },
  { key: "region", label: "Region line", hideWhenBlank: true, placeholder: "chichibu, saitama, japan" },
  { key: "description", label: "Description", long: true },
  { key: "tastingNotes", label: "Tasting notes", long: true, hideWhenBlank: true, placeholder: "Only filled when the docx has a Tasting Notes section" },
  { key: "abv", label: "Alcohol", hideWhenBlank: true, placeholder: "43% ABV" },
  { key: "size", label: "Size", hideWhenBlank: true, placeholder: "700 ml" },
  { key: "age", label: "Age", hideWhenBlank: true, placeholder: "NAS" },
  { key: "style", label: "Style", hideWhenBlank: true, placeholder: "Blended Whisky" },
  { key: "adjustments", label: "Adjustments", hideWhenBlank: true, placeholder: "Non-chill filtered" },
  { key: "release", label: "Release", hideWhenBlank: true, placeholder: "2026 Selection" },
  { key: "peat", label: "Peated", hideWhenBlank: true, placeholder: "Unpeated" },
  { key: "still", label: "Still type", hideWhenBlank: true, placeholder: "Copper pot" },
  { key: "bottling", label: "Bottling", hideWhenBlank: true, placeholder: "Single cask" },
  { key: "barrels", label: "Barrels used", hideWhenBlank: true },
  { key: "bottleCount", label: "Bottle count", hideWhenBlank: true, placeholder: "236 bottles" },
  { key: "distilleryName", label: "Distillery name" },
  { key: "distilleryAbout", label: "About the distillery", long: true },
  { key: "mapLabel", label: "Map label", hideWhenBlank: true, placeholder: "saitama • japan" },
  { key: "specialNote", label: "Special note (not on the sheet)", offSheet: true },
  { key: "extras", label: "Other details from the docx (not on the sheet)", long: true, offSheet: true },
];

export const emptyFields = (): SheetFields =>
  Object.fromEntries(FIELD_DEFS.map((f) => [f.key, ""])) as SheetFields;

// ---------------------------------------------------------------------------------------------
// docx → paragraphs

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e] ?? m;
  });

/** Text of every paragraph in word/document.xml, in order (empty paragraphs dropped). */
export function docxParagraphs(documentXml: string): string[] {
  const out: string[] = [];
  for (const [body] of documentXml.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)) {
    let text = "";
    for (const piece of body.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)) {
      if (piece[1] !== undefined) text += decode(piece[1]);
      else text += piece[0] === "<w:tab/>" ? " " : "\n";
    }
    text = text.replace(/[  ]+/g, " ").trim();
    if (text) out.push(text);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// paragraphs → fields

/** Known "Label: value" lines in the spec block. Other labels are kept as "other details". */
const SPEC_LABELS: [RegExp, FieldKey][] = [
  [/^(bottle )?size$/, "size"],
  [/^(abv( percentage)?|alcohol|proof)$/, "abv"],
  [/^style$/, "style"],
  [/^age( statement)?$/, "age"],
  [/^peat(ed|ing)?( level)?$/, "peat"],
  [/^(barrels?|casks?)( used)?( to age)?$/, "barrels"],
  [/^special notes?$/, "specialNote"],
  [/^still( type)?s?$/, "still"],
  [/^bottling$/, "bottling"],
  [/^(bottle count|bottles|number of bottles|outturn)$/, "bottleCount"],
  [/^release$/, "release"],
  [/^(adjustments|filtration)$/, "adjustments"],
  [/^((distillery |producer )?(region|location|origin))$/, "region"],
];

const specKey = (label: string): FieldKey | undefined => {
  const l = label.toLowerCase().replace(/\s+/g, " ").trim();
  return SPEC_LABELS.find(([re]) => re.test(l))?.[1];
};

/** "Label: value" with a short label (so a sentence containing a colon doesn't count). */
const specLine = (p: string) => {
  const m = p.match(/^([^:.!?]{2,45}):\s*(\S.*)$/);
  return m ? { label: m[1].trim(), value: m[2].trim() } : null;
};

/** A short line without sentence punctuation, e.g. a repeated product name or "Mars Whisky". */
const isTitleLine = (p: string) => p.length <= 90 && !/[.!?]["”’)]?$/.test(p.replace(/:\s*$/, "")) && !specLine(p);

const STOPWORDS = new Set(["the", "a", "an", "of", "and", "about"]);
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !STOPWORDS.has(w));

type Heading = { kind: "quote" | "about" | "product" | "tasting"; title: string };

/**
 * Section headings, with or without a colon:
 *   "Tasting Notes"                       → tasting notes
 *   "From Hombo San:"                     → quote (goes into the description)
 *   "About Akkeshi Blended Whisky Soko"   → the product description (the words match the product name)
 *   "About Mars Whisky:", "About the Producer" → the distillery
 */
function heading(p: string, productName: string): Heading | null {
  if (p.length > 70) return null;
  const t = p.replace(/:\s*$/, "").trim();
  if (/^tasting notes?$/i.test(t)) return { kind: "tasting", title: t };
  if (/^from\s+/i.test(t) && p.trim().endsWith(":")) return { kind: "quote", title: t };
  if (/^about\s+/i.test(t) && isTitleLine(t)) {
    const title = t.replace(/^about\s+(the\s+)?/i, "");
    const w = words(title);
    const name = new Set(words(productName));
    const aboutProduct = w.length > 0 && w.filter((x) => name.has(x)).length / w.length >= 0.75;
    return { kind: aboutProduct ? "product" : "about", title };
  }
  return null;
}

const normalizeAbv = (v: string) => (/abv/i.test(v) ? v : /^\d+(\.\d+)?\s*%$/.test(v) ? `${v.replace(/\s+/g, "")} ABV` : v);
const normalizeSize = (v: string) => v.replace(/^(\d+(?:\.\d+)?)\s*(ml|cl|l)$/i, (_, n: string, u: string) => `${n} ${u.toLowerCase()}`);
const GENERIC_PRODUCER = /^(producer|distillery|brand|maker|company|bottler)$/i;

export type ParseResult = { fields: SheetFields; notes: string[] };

export function parseSellSheet(paragraphs: string[]): ParseResult {
  const fields = emptyFields();
  const notes: string[] = [];
  const extras: string[] = [];
  const ps = paragraphs.map((p) => p.trim()).filter(Boolean);
  if (!ps.length) return { fields, notes: ["The docx is empty."] };

  const firstName = ps[0];
  let i = 1;

  // Spec block: every "Label: value" line until the first line that isn't one.
  while (i < ps.length) {
    const spec = specLine(ps[i]);
    if (!spec || heading(ps[i], firstName)) break;
    const key = specKey(spec.label);
    if (key && !fields[key]) fields[key] = spec.value;
    else extras.push(`${spec.label}: ${spec.value}`);
    i++;
  }

  // Repeated product name above the description (the docx sometimes spells it differently).
  let name = firstName;
  if (i < ps.length && isTitleLine(ps[i]) && !heading(ps[i], firstName)) {
    name = ps[i];
    if (normalize(name) !== normalize(firstName)) notes.push(`The docx names the product two ways: "${firstName}" and "${name}". Using "${name}".`);
    i++;
  }
  fields.name = name;

  // Description until the first section heading, then the sections.
  const description: string[] = [];
  while (i < ps.length && !heading(ps[i], name)) description.push(ps[i++]);

  const quote: string[] = [];
  const tasting: string[] = [];
  const about: string[] = [];
  while (i < ps.length) {
    const h = heading(ps[i++], name)!;
    const body: string[] = [];
    while (i < ps.length && !heading(ps[i], name)) body.push(ps[i++]);
    if (h.kind === "quote") quote.push(`${h.title}:`, ...body);
    else if (h.kind === "tasting") tasting.push(...body);
    else if (h.kind === "product") description.push(...body);
    else {
      // "About Mars Whisky:" / "About the Producer", then the distillery name on its own line.
      if (body.length > 1 && isTitleLine(body[0])) fields.distilleryName = body.shift()!.replace(/:\s*$/, "");
      else if (!GENERIC_PRODUCER.test(h.title)) fields.distilleryName = h.title;
      about.push(...body);
    }
  }

  fields.description = [description.join("\n\n"), quote.join("\n")].filter(Boolean).join("\n\n");
  fields.tastingNotes = tasting.join("\n\n");
  fields.distilleryAbout = about.join("\n\n");
  fields.abv = normalizeAbv(fields.abv);
  fields.size = normalizeSize(fields.size);
  fields.extras = extras.join("\n");

  // "Akkeshi, Hokkaido" → region "Akkeshi, Hokkaido, Japan" and map label "Hokkaido • Japan".
  if (fields.region) {
    const parts = fields.region.split(",").map((x) => x.trim()).filter(Boolean);
    if (!parts.some((x) => /^japan$/i.test(x))) parts.push("Japan");
    fields.region = parts.join(", ");
    fields.mapLabel = parts.slice(-2).join(" • ");
  }

  if (!fields.description) notes.push("No description found.");
  if (!fields.distilleryAbout) notes.push('No "About …" section for the distillery found.');
  if (!fields.distilleryName) notes.push("No distillery name found.");
  return { fields, notes };
}

/** Lowercase letters and digits only: used to pair photos with docx files by filename. */
export const normalize = (s: string) => s.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]/g, "");

/** Blank fields that will be hidden on the sheet (so the designer knows before sending). */
export const hiddenFields = (f: SheetFields) =>
  FIELD_DEFS.filter((d) => d.hideWhenBlank && !f[d.key].trim()).map((d) => d.label);

// ---------------------------------------------------------------------------------------------
// Batches (shared by the dashboard, the API and the Figma plugin)

export type BatchSheet = { fields: SheetFields; photo: { index: number; type: string } | null };
export type Batch = { id: string; name: string; createdAt: string; sheets: BatchSheet[] };
export type BatchSummary = { id: string; name: string; createdAt: string; count: number };

export const isBatchId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
export const PHOTO_TYPES = ["image/png", "image/jpeg", "image/gif"];
/** Vercel caps a request body at 4.5 MB; the dashboard shrinks photos to fit. */
export const MAX_PHOTO_BYTES = 4_400_000;
