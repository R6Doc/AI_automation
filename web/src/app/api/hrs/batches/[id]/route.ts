import { deleteBatch, getBatch, saveBatch } from "@/lib/hrs-store";
import { handle, json, preflight } from "@/lib/hrs-api";
import { FIELD_DEFS, isBatchId, type Batch, type SheetFields } from "@/lib/sellsheet";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/hrs/batches/[id]">) {
  const { id } = await ctx.params;
  if (!isBatchId(id)) return json({ error: "Bad batch id" }, 400);
  return handle(async () => {
    const batch = await getBatch(id);
    return batch ? json(batch) : json({ error: "Batch not found (maybe already created)" }, 404);
  });
}

/** Saves the batch once its photos are uploaded. Only known fields are kept. */
export async function PUT(req: Request, ctx: RouteContext<"/api/hrs/batches/[id]">) {
  const { id } = await ctx.params;
  if (!isBatchId(id)) return json({ error: "Bad batch id" }, 400);
  return handle(async () => {
    const body = (await req.json()) as Partial<Batch>;
    if (!Array.isArray(body.sheets) || body.sheets.length === 0) return json({ error: "The batch has no sheets" }, 400);
    const batch: Batch = {
      id,
      name: String(body.name ?? "").slice(0, 120) || "Sell sheets",
      createdAt: new Date().toISOString(),
      sheets: body.sheets.map((s) => ({
        fields: Object.fromEntries(FIELD_DEFS.map((f) => [f.key, String(s.fields?.[f.key] ?? "")])) as SheetFields,
        photo: s.photo && Number.isInteger(s.photo.index) ? { index: s.photo.index, type: String(s.photo.type) } : null,
      })),
    };
    await saveBatch(batch);
    return json({ ok: true, id });
  });
}

/** Called by the plugin after the sheets are in Figma, or by the dashboard to cancel a batch. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/hrs/batches/[id]">) {
  const { id } = await ctx.params;
  if (!isBatchId(id)) return json({ error: "Bad batch id" }, 400);
  return handle(async () => {
    await deleteBatch(id);
    return json({ ok: true });
  });
}

export const OPTIONS = preflight;
