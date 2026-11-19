import { listBatches } from "@/lib/hrs-store";
import { handle, json, preflight } from "@/lib/hrs-api";

export const dynamic = "force-dynamic";

/** Batches waiting for the Figma plugin, newest first. */
export async function GET() {
  return handle(async () => json({ batches: await listBatches() }));
}

export const OPTIONS = preflight;
