import { getPhoto, savePhoto } from "@/lib/hrs-store";
import { CORS, handle, json, preflight } from "@/lib/hrs-api";
import { MAX_PHOTO_BYTES, PHOTO_TYPES, isBatchId } from "@/lib/sellsheet";

export const dynamic = "force-dynamic";

type Ctx = RouteContext<"/api/hrs/batches/[id]/photos/[n]">;

async function parse(ctx: Ctx) {
  const { id, n } = await ctx.params;
  const index = Number(n);
  return isBatchId(id) && Number.isInteger(index) && index >= 0 && index < 500 ? { id, index } : null;
}

/** Raw image body (PNG, JPEG or GIF: the formats Figma accepts). */
export async function PUT(req: Request, ctx: Ctx) {
  const p = await parse(ctx);
  if (!p) return json({ error: "Bad photo address" }, 400);
  const type = req.headers.get("content-type")?.split(";")[0] ?? "";
  if (!PHOTO_TYPES.includes(type)) return json({ error: `Photos must be PNG, JPEG or GIF (got ${type || "unknown"})` }, 415);
  return handle(async () => {
    const photo = await req.blob();
    if (photo.size > MAX_PHOTO_BYTES) return json({ error: "Photo too large" }, 413);
    await savePhoto(p.id, p.index, new Blob([photo], { type }));
    return json({ ok: true });
  });
}

export async function GET(_req: Request, ctx: Ctx) {
  const p = await parse(ctx);
  if (!p) return json({ error: "Bad photo address" }, 400);
  return handle(async () => {
    const photo = await getPhoto(p.id, p.index);
    if (!photo) return json({ error: "Photo not found" }, 404);
    const body = photo.body instanceof ReadableStream ? photo.body : new Uint8Array(photo.body);
    return new Response(body, { headers: { ...CORS, "Content-Type": photo.contentType, "Cache-Control": "no-store" } });
  });
}

export const OPTIONS = preflight;
