"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { strFromU8, unzipSync } from "fflate";
import {
  FIELD_DEFS,
  MAX_PHOTO_BYTES,
  docxParagraphs,
  hiddenFields,
  normalize,
  parseSellSheet,
  type BatchSheet,
  type BatchSummary,
  type FieldKey,
  type SheetFields,
} from "@/lib/sellsheet";

type Photo = { key: number; name: string; blob: Blob; url: string; width: number; height: number };
type Sheet = { key: number; fileName: string; fields: SheetFields; notes: string[]; photo: Photo | null; open: boolean };
type SendState =
  | { kind: "idle" }
  | { kind: "sending"; step: string }
  | { kind: "sent"; name: string; count: number }
  | { kind: "error"; message: string };

let nextKey = 1;
const today = () => new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

async function readDocx(file: File) {
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => f.name === "word/document.xml" });
  const xml = zip["word/document.xml"];
  if (!xml) throw new Error("not a Word document");
  return parseSellSheet(docxParagraphs(strFromU8(xml)));
}

/**
 * Figma takes PNG/JPEG/GIF up to 4096 px, and Vercel caps uploads at 4.5 MB. Big photos are scaled
 * down (PNG stays PNG so cut-out bottles keep their transparency; everything else becomes JPEG).
 */
async function preparePhoto(file: File): Promise<Photo> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name}: this browser can't read that image (HEIC? export it as PNG or JPEG)`);
  }
  const crop = trimBox(bitmap);
  const { width, height } = crop;
  const untouched = crop.x === 0 && crop.y === 0 && width === bitmap.width && height === bitmap.height;
  const fits = (b: Blob, w: number, h: number) => b.size <= MAX_PHOTO_BYTES && Math.max(w, h) <= 4096;
  const keep = untouched && ["image/png", "image/jpeg"].includes(file.type) && fits(file, width, height) && Math.max(width, height) <= 3000;
  if (keep) return { key: nextKey++, name: file.name, blob: file, url: URL.createObjectURL(file), width, height };

  const type = file.type === "image/png" || file.type === "image/gif" ? "image/png" : "image/jpeg";
  for (const longSide of [3000, 2400, 1800, 1400, 1000]) {
    const scale = Math.min(1, longSide / Math.max(width, height));
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, crop.x, crop.y, width, height, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.9));
    if (blob && fits(blob, w, h)) return { key: nextKey++, name: file.name, blob, url: URL.createObjectURL(blob), width: w, height: h };
  }
  throw new Error(`${file.name}: couldn't make it small enough to upload`);
}

/**
 * The bottle's bounding box, ignoring transparent margins (cut-out PNGs) or plain white margins
 * (studio shots), plus a little padding. Measured on a small copy so huge photos stay fast.
 */
function trimBox(bitmap: ImageBitmap) {
  const full = { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
  const scale = Math.min(1, 600 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;

  // Transparent corner → trim transparency; otherwise trim near-white.
  const transparent = px[3] < 16;
  const isBackground = (i: number) =>
    transparent ? px[i + 3] < 16 : px[i] > 244 && px[i + 1] > 244 && px[i + 2] > 244;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isBackground((y * w + x) * 4)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return full; // all background
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.02);
  const x0 = Math.max(0, minX - pad), y0 = Math.max(0, minY - pad);
  const x1 = Math.min(w, maxX + 1 + pad), y1 = Math.min(h, maxY + 1 + pad);
  if (x1 - x0 > w * 0.97 && y1 - y0 > h * 0.97) return full; // nothing worth trimming
  const x = Math.floor(x0 / scale);
  const y = Math.floor(y0 / scale);
  return {
    x,
    y,
    width: Math.min(bitmap.width - x, Math.ceil((x1 - x0) / scale)),
    height: Math.min(bitmap.height - y, Math.ceil((y1 - y0) / scale)),
  };
}

/** A photo belongs to a sheet when their filenames match (ignoring case, spaces and punctuation). */
function matches(photo: Photo, sheet: Sheet) {
  const p = normalize(photo.name);
  const d = normalize(sheet.fileName);
  const n = normalize(sheet.fields.name);
  return p.length > 2 && (p === d || p === n || p.includes(d) || d.includes(p) || (n.length > 2 && (p.includes(n) || n.includes(p))));
}

/** Pasted/screenshot names like "image.png" or "Screenshot 2026-…" — usually not the bottle shot. */
const GENERIC_IMAGE = /^(image|img|photo|untitled|pasted|screen ?shot|captura)\b[\w\s().-]*\.\w+$/i;

type TrelloCard = { id: string; name: string; url: string; attachments: { id: string; name: string; mimeType: string; bytes: number }[] };

/**
 * Picks the bottle shot among a card's images: one named after the product wins, then any image
 * with a real name (biggest first). Screenshot-style names only count when they are the only image.
 */
function pickBottle<T extends { name: string; bytes: number }>(images: T[], names: string[]): T | null {
  if (images.length === 1) return images[0];
  const keys = names.map(normalize).filter((n) => n.length > 2);
  const named = images.filter((img) => {
    const p = normalize(img.name.replace(/\.\w+$/, ""));
    return p.length > 2 && keys.some((k) => k.includes(p) || p.includes(k));
  });
  const real = images.filter((img) => !GENERIC_IMAGE.test(img.name)).sort((a, b) => b.bytes - a.bytes);
  return named[0] ?? real[0] ?? null;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`);
  return data as T;
}

export default function SellSheets() {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [loosePhotos, setLoosePhotos] = useState<Photo[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [batchName, setBatchName] = useState("");
  const [send, setSend] = useState<SendState>({ kind: "idle" });
  const [pending, setPending] = useState<BatchSummary[] | null>(null);
  const [pendingError, setPendingError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<"files" | "trello">("files");
  const [trelloText, setTrelloText] = useState("");
  const [trelloBusy, setTrelloBusy] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const refreshPending = useCallback(async () => {
    try {
      const { batches } = await api<{ batches: BatchSummary[] }>("/api/hrs/batches");
      setPending(batches);
      setPendingError("");
    } catch (e) {
      setPendingError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshPending();
    const id = setInterval(refreshPending, 15000);
    return () => clearInterval(id);
  }, [refreshPending]);

  /** Docx files become sheets, images get paired with a sheet by filename or wait in the loose pile. */
  const addFiles = async (files: File[]) => {
    const errors: string[] = [];
    const newSheets: Sheet[] = [];
    const newPhotos: Photo[] = [];
    await Promise.all(
      files.map(async (file) => {
        const lower = file.name.toLowerCase();
        try {
          if (lower.endsWith(".docx")) {
            const { fields, notes } = await readDocx(file);
            newSheets.push({ key: nextKey++, fileName: file.name, fields, notes, photo: null, open: true });
          } else if (file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|tiff?)$/.test(lower)) {
            newPhotos.push(await preparePhoto(file));
          } else if (lower.endsWith(".doc")) {
            errors.push(`${file.name}: old .doc format. Open it in Word and save as .docx.`);
          } else {
            errors.push(`${file.name}: not a .docx or an image, skipped.`);
          }
        } catch (e) {
          errors.push(e instanceof Error ? e.message : `${file.name}: ${String(e)}`);
        }
      }),
    );
    newSheets.sort((a, b) => a.fileName.localeCompare(b.fileName));

    // Pair every photo without a sheet (old loose ones + new) with sheets that still have no photo.
    const all = [...sheets, ...newSheets];
    let pool = [...loosePhotos, ...newPhotos];
    const paired = all.map((s) => {
      if (s.photo) return s;
      const hit = pool.find((p) => matches(p, s));
      if (!hit) return s;
      pool = pool.filter((p) => p !== hit);
      return { ...s, photo: hit };
    });
    // One sheet and one photo with unrelated names: obviously they go together.
    const unphotographed = paired.filter((s) => !s.photo);
    if (unphotographed.length === 1 && pool.length === 1 && newSheets.length + newPhotos.length > 0) {
      const only = unphotographed[0];
      paired[paired.indexOf(only)] = { ...only, photo: pool[0] };
      pool = [];
    }
    setSheets(paired);
    setLoosePhotos(pool);
    setProblems(errors);
    if (send.kind !== "sending") setSend({ kind: "idle" });
  };

  /** Each card's docx becomes a sheet, with the card's bottle shot already attached. */
  const addTrelloCards = async (text: string) => {
    const links = [...new Set(text.split(/[\s,]+/).filter(Boolean))];
    if (!links.length) return;
    const errors: string[] = [];
    const newSheets: Sheet[] = [];
    const extraPhotos: Photo[] = [];
    const failed: string[] = [];
    for (const [i, link] of links.entries()) {
      setTrelloBusy(`Reading card ${i + 1} of ${links.length}…`);
      try {
        const card = await api<TrelloCard>(`/api/hrs/trello?card=${encodeURIComponent(link)}`);
        const download = async (a: TrelloCard["attachments"][number]) => {
          const res = await fetch(`/api/hrs/trello/${card.id}/attachments/${a.id}`, { cache: "no-store" });
          if (!res.ok) throw new Error(`${card.name}: couldn't download ${a.name} (${(await res.json().catch(() => ({}))).error ?? res.status})`);
          const blob = await res.blob();
          return new File([blob], a.name, { type: a.mimeType || blob.type });
        };
        const docs = card.attachments.filter((a) => a.name.toLowerCase().endsWith(".docx"));
        const images = card.attachments.filter((a) => a.mimeType.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(a.name));
        if (!docs.length) {
          errors.push(`${card.name}: no .docx attached to the card.`);
          failed.push(link);
          continue;
        }
        const cardSheets: Sheet[] = [];
        for (const d of docs) {
          const { fields, notes } = await readDocx(await download(d));
          cardSheets.push({ key: nextKey++, fileName: d.name, fields, notes, photo: null, open: true });
        }
        // One docx: pick the card's bottle shot. Several: pair by name, the rest go to the pile.
        const used = new Set<string>();
        for (const sheet of cardSheets) {
          const free = images.filter((img) => !used.has(img.id));
          const names = cardSheets.length === 1 ? [sheet.fields.name, card.name, sheet.fileName] : [sheet.fields.name, sheet.fileName];
          const pick = cardSheets.length === 1 ? pickBottle(free, names) : pickBottle(free.filter((img) => !GENERIC_IMAGE.test(img.name)), names);
          if (!pick) continue;
          used.add(pick.id);
          sheet.photo = await preparePhoto(await download(pick));
        }
        // Couldn't tell which image is the bottle: offer the card's images to pick from.
        if (cardSheets.some((s) => !s.photo)) {
          for (const img of images.filter((img) => !used.has(img.id))) extraPhotos.push(await preparePhoto(await download(img)));
        }
        newSheets.push(...cardSheets);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
        failed.push(link);
      }
    }
    setSheets((ss) => [...ss, ...newSheets]);
    setLoosePhotos((ps) => [...ps, ...extraPhotos]);
    setProblems(errors);
    setTrelloText(failed.join("\n"));
    setTrelloBusy("");
    if (send.kind !== "sending") setSend({ kind: "idle" });
  };

  const update = (key: number, patch: Partial<Sheet>) => setSheets((ss) => ss.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const setField = (key: number, field: FieldKey, value: string) =>
    setSheets((ss) => ss.map((s) => (s.key === key ? { ...s, fields: { ...s.fields, [field]: value } } : s)));

  const removeSheet = (sheet: Sheet) => {
    setSheets((ss) => ss.filter((s) => s.key !== sheet.key));
    if (sheet.photo) setLoosePhotos((ps) => [...ps, sheet.photo!]);
  };

  /** Give a sheet a photo from the loose pile (its old photo goes back to the pile). */
  const assignPhoto = (sheet: Sheet, photoKey: number | null) => {
    const chosen = loosePhotos.find((p) => p.key === photoKey) ?? null;
    setLoosePhotos((ps) => [...ps.filter((p) => p.key !== photoKey), ...(sheet.photo ? [sheet.photo] : [])]);
    update(sheet.key, { photo: chosen });
  };

  const replacePhoto = async (sheet: Sheet, file: File) => {
    try {
      const photo = await preparePhoto(file);
      if (sheet.photo) setLoosePhotos((ps) => [...ps, sheet.photo!]);
      update(sheet.key, { photo });
    } catch (e) {
      setProblems([e instanceof Error ? e.message : String(e)]);
    }
  };

  const blocking = sheets.flatMap((s, i) => {
    const out: string[] = [];
    const label = s.fields.name || s.fileName;
    if (!s.fields.name.trim()) out.push(`Sheet ${i + 1}: needs a product name`);
    if (!s.photo) out.push(`${label}: needs a bottle photo`);
    return out;
  });

  const sendBatch = async () => {
    if (!sheets.length || blocking.length) return;
    const id = crypto.randomUUID();
    const name = batchName.trim() || `${today()} · ${sheets.length} sheet${sheets.length === 1 ? "" : "s"}`;
    try {
      const payload: BatchSheet[] = [];
      for (const [i, s] of sheets.entries()) {
        setSend({ kind: "sending", step: `Uploading photo ${i + 1} of ${sheets.length}…` });
        await api(`/api/hrs/batches/${id}/photos/${i}`, {
          method: "PUT",
          headers: { "Content-Type": s.photo!.blob.type },
          body: s.photo!.blob,
        });
        payload.push({ fields: s.fields, photo: { index: i, type: s.photo!.blob.type } });
      }
      setSend({ kind: "sending", step: "Saving the batch…" });
      await api(`/api/hrs/batches/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, sheets: payload }),
      });
      for (const s of sheets) if (s.photo) URL.revokeObjectURL(s.photo.url);
      setSheets([]);
      setBatchName("");
      setSend({ kind: "sent", name, count: payload.length });
      refreshPending();
    } catch (e) {
      // Clean up whatever photos made it up.
      fetch(`/api/hrs/batches/${id}`, { method: "DELETE" }).catch(() => {});
      setSend({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const cancelBatch = async (b: BatchSummary) => {
    if (!window.confirm(`Delete "${b.name}" without creating it in Figma?`)) return;
    try {
      await api(`/api/hrs/batches/${b.id}`, { method: "DELETE" });
    } catch (e) {
      setPendingError(e instanceof Error ? e.message : String(e));
    }
    refreshPending();
  };

  const sending = send.kind === "sending";

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-40 pt-8 sm:px-6">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Tokiwa</p>
        <h1 className="text-2xl font-bold tracking-tight">Sell Sheets</h1>
        <p className="mt-1 text-sm text-muted">
          Drop the product docx files and bottle photos, check the fields, then send the batch. In Figma, run
          the <strong className="text-fg">Tokiwa Sell Sheets</strong> plugin to create them all at once.
        </p>
      </header>

      <div className="mb-3 inline-flex rounded-lg border border-line bg-card p-1 text-sm font-semibold">
        {(
          [
            ["files", "Drop files"],
            ["trello", "Trello cards"],
          ] as const
        ).map(([m, text]) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-md px-3 py-1.5 transition ${mode === m ? "bg-accent text-white" : "text-muted hover:text-fg"}`}
          >
            {text}
          </button>
        ))}
      </div>

      {mode === "files" ? (
        <section
          className={`card mb-6 flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed py-10 text-center transition ${
            dragging ? "border-accent bg-logo" : "hover:border-accent"
          }`}
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles([...e.dataTransfer.files]);
          }}
        >
          <p className="font-semibold">Drop docx files and bottle photos here</p>
          <p className="text-sm text-muted">or click to choose. Name each photo like its docx (e.g. solla.docx + solla.png) and they pair up automatically.</p>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".docx,image/*"
            className="hidden"
            onChange={(e) => {
              addFiles([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
        </section>
      ) : (
        <section className="card mb-6">
          <label className="label" htmlFor="trello-links">
            Trello card links
          </label>
          <textarea
            id="trello-links"
            className="field h-auto min-h-24 w-full py-2 font-mono text-sm"
            placeholder={"https://trello.com/c/4uyG8nLr/169-the-akkeshi-single-malt-rikka\none link per line, as many as you like"}
            value={trelloText}
            onChange={(e) => setTrelloText(e.target.value)}
            disabled={!!trelloBusy}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              disabled={!!trelloBusy || !trelloText.trim()}
              onClick={() => addTrelloCards(trelloText)}
            >
              {trelloBusy ? "Loading…" : "Load cards"}
            </button>
            <p className="text-sm text-muted">
              {trelloBusy || "Takes the .docx from each card and its bottle shot (screenshots named like image.png are skipped)."}
            </p>
          </div>
        </section>
      )}

      {problems.length > 0 && (
        <div className="mb-6 rounded-xl border border-bad/30 bg-bad/5 p-4 text-sm text-bad">
          {problems.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      )}

      {loosePhotos.length > 0 && (
        <section className="card mb-6">
          <p className="label">Photos not matched to a docx</p>
          <div className="flex flex-wrap gap-3">
            {loosePhotos.map((p) => (
              <figure key={p.key} className="w-24 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="h-28 w-24 rounded-lg bg-logo object-contain" />
                <figcaption className="mt-1 truncate text-xs text-muted" title={p.name}>{p.name}</figcaption>
                <button
                  type="button"
                  className="text-xs text-bad hover:underline"
                  onClick={() => {
                    URL.revokeObjectURL(p.url);
                    setLoosePhotos((ps) => ps.filter((x) => x.key !== p.key));
                  }}
                >
                  Remove
                </button>
              </figure>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Pick one for a sheet with the photo menu on its card.</p>
        </section>
      )}

      <div className="space-y-4">
        {sheets.map((s, i) => {
          const hidden = hiddenFields(s.fields);
          return (
            <article key={s.key} className="card">
              <div className="flex gap-4">
                <PhotoSlot
                  sheet={s}
                  loose={loosePhotos}
                  onPick={(k) => assignPhoto(s, k)}
                  onFile={(f) => replacePhoto(s, f)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Sheet {i + 1} · {s.fileName}</p>
                      <h2 className="truncate text-lg font-bold">{s.fields.name || "Untitled"}</h2>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button type="button" className="rounded-lg px-3 py-1.5 text-sm font-semibold text-muted hover:text-fg" onClick={() => update(s.key, { open: !s.open })}>
                        {s.open ? "Collapse" : "Edit"}
                      </button>
                      <button type="button" className="rounded-lg px-3 py-1.5 text-sm font-semibold text-bad hover:bg-bad/5" onClick={() => removeSheet(s)}>
                        Remove
                      </button>
                    </div>
                  </div>
                  {s.notes.map((n) => (
                    <p key={n} className="mt-2 rounded-lg bg-logo px-3 py-2 text-sm">{n}</p>
                  ))}
                  {hidden.length > 0 && (
                    <p className="mt-2 text-sm text-muted">
                      Blank, so hidden on the sheet: {hidden.join(", ")}.
                    </p>
                  )}
                </div>
              </div>

              {s.open && (
                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  {FIELD_DEFS.map((f) => (
                    <div key={f.key} className={f.long || f.key === "name" || f.key === "barrels" || f.offSheet ? "sm:col-span-3" : ""}>
                      <label className="label" htmlFor={`${s.key}-${f.key}`}>{f.label}</label>
                      {f.long ? (
                        <textarea
                          id={`${s.key}-${f.key}`}
                          className="field h-auto min-h-24 py-2 leading-relaxed"
                          rows={f.key === "description" || f.key === "distilleryAbout" ? 7 : 3}
                          value={s.fields[f.key]}
                          placeholder={f.placeholder}
                          onChange={(e) => setField(s.key, f.key, e.target.value)}
                        />
                      ) : (
                        <input
                          id={`${s.key}-${f.key}`}
                          className="field"
                          value={s.fields[f.key]}
                          placeholder={f.placeholder && `e.g. ${f.placeholder}`}
                          onChange={(e) => setField(s.key, f.key, e.target.value)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {sheets.length > 0 && (
        <section className="card mt-6">
          <label className="label" htmlFor="batch-name">Batch name</label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="batch-name"
              className="field"
              value={batchName}
              placeholder={`${today()} · ${sheets.length} sheet${sheets.length === 1 ? "" : "s"}`}
              onChange={(e) => setBatchName(e.target.value)}
            />
            <button
              type="button"
              className="h-11 shrink-0 rounded-lg bg-accent px-5 font-semibold text-accent-fg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={sending || blocking.length > 0}
              onClick={sendBatch}
            >
              {sending ? "Sending…" : `Send ${sheets.length} to Figma`}
            </button>
          </div>
          {blocking.length > 0 && (
            <ul className="mt-3 list-inside list-disc text-sm text-bad">
              {blocking.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {send.kind === "sending" && <p className="mt-4 text-sm text-muted">{send.step}</p>}
      {send.kind === "error" && <p className="mt-4 rounded-xl bg-bad/5 p-4 text-sm text-bad">Couldn&apos;t send: {send.message}</p>}
      {send.kind === "sent" && (
        <p className="mt-4 rounded-xl bg-ok/10 p-4 text-sm">
          <strong>{send.name}</strong> is ready ({send.count} sheet{send.count === 1 ? "" : "s"}). In Figma, open the TOKIWA file
          and run <strong>Plugins → Tokiwa Sell Sheets</strong>.
        </p>
      )}

      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Waiting for Figma</h2>
          <button type="button" className="text-sm font-semibold text-accent hover:underline" onClick={refreshPending}>Refresh</button>
        </div>
        {pendingError && <p className="rounded-xl bg-bad/5 p-4 text-sm text-bad">{pendingError}</p>}
        {pending && pending.length === 0 && !pendingError && <p className="text-sm text-muted">Nothing waiting. Batches disappear from here once the plugin creates them.</p>}
        <ul className="space-y-2">
          {pending?.map((b) => (
            <li key={b.id} className="card flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{b.name}</p>
                <p className="text-xs text-muted">
                  {b.count} sheet{b.count === 1 ? "" : "s"} · sent {new Date(b.createdAt).toLocaleString()}
                </p>
              </div>
              <button type="button" className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-bad hover:bg-bad/5" onClick={() => cancelBatch(b)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function PhotoSlot({ sheet, loose, onPick, onFile }: { sheet: Sheet; loose: Photo[]; onPick: (key: number | null) => void; onFile: (f: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      className="w-28 shrink-0"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
    >
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={`flex h-36 w-28 items-center justify-center overflow-hidden rounded-xl bg-logo text-xs text-muted transition hover:ring-2 hover:ring-accent ${
          sheet.photo ? "" : "border-2 border-dashed border-bad/40"
        }`}
        title="Click or drop to replace the photo"
      >
        {sheet.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sheet.photo.url} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="px-2 text-center">Drop the bottle photo</span>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      {(loose.length > 0 || sheet.photo) && (
        <select
          className="mt-2 w-28 truncate rounded-lg border border-line bg-bg px-1 py-1 text-xs"
          value=""
          onChange={(e) => onPick(e.target.value === "none" ? null : Number(e.target.value))}
        >
          <option value="">{sheet.photo ? "Swap photo…" : "Pick photo…"}</option>
          {loose.map((p) => (
            <option key={p.key} value={p.key}>{p.name}</option>
          ))}
          {sheet.photo && <option value="none">No photo</option>}
        </select>
      )}
      {sheet.photo && <p className="mt-1 truncate text-[11px] text-muted" title={sheet.photo.name}>{sheet.photo.name}</p>}
    </div>
  );
}
