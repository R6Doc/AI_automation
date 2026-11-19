import { json } from "@/lib/hrs-api";
import { TrelloError, downloadAttachment, isTrelloId } from "@/lib/trello";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/hrs/trello/[card]/attachments/[id]">) {
  const { card, id } = await ctx.params;
  if (!isTrelloId(card) || !isTrelloId(id)) return json({ error: "Bad attachment address" }, 400);
  try {
    return await downloadAttachment(card, id);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, e instanceof TrelloError ? e.status : 500);
  }
}
