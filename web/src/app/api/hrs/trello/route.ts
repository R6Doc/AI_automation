import { json } from "@/lib/hrs-api";
import { TrelloError, cardRef, getCard } from "@/lib/trello";

export const dynamic = "force-dynamic";

/** GET ?card=<Trello card link>: the card's name and uploaded attachments. */
export async function GET(req: Request) {
  const ref = cardRef(new URL(req.url).searchParams.get("card") ?? "");
  if (!ref) return json({ error: "That doesn't look like a Trello card link (trello.com/c/…)." }, 400);
  try {
    return json(await getCard(ref));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, e instanceof TrelloError ? e.status : 500);
  }
}
