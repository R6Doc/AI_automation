import "server-only";

/**
 * Reads Trello cards for the Sell Sheets page. Needs TRELLO_KEY and TRELLO_TOKEN (a token from
 * https://trello.com/app-key that can read the boards the cards live on).
 */

export class TrelloError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

export type TrelloAttachment = { id: string; name: string; mimeType: string; bytes: number };
export type TrelloCard = { id: string; name: string; url: string; attachments: TrelloAttachment[] };

const TRELLO_ID = /^[0-9a-f]{24}$/;
const SHORT_LINK = /^[A-Za-z0-9]{8}$/;

/** Accepts a card link (trello.com/c/<shortLink>/...), a bare short link, or a card id. */
export function cardRef(input: string): string | null {
  const s = input.trim();
  const m = s.match(/trello\.com\/c\/([A-Za-z0-9]{8})/);
  if (m) return m[1];
  return SHORT_LINK.test(s) || TRELLO_ID.test(s) ? s : null;
}

export const isTrelloId = (s: string) => TRELLO_ID.test(s);

function credentials() {
  const key = process.env.TRELLO_KEY;
  const token = process.env.TRELLO_TOKEN;
  if (!key || !token) throw new TrelloError("Trello isn't set up: add TRELLO_KEY and TRELLO_TOKEN to the environment.", 503);
  return { key, token };
}

/** Trello wants this header (not query params) for attachment downloads. */
const authHeader = ({ key, token }: { key: string; token: string }) => ({
  Authorization: `OAuth oauth_consumer_key="${key}", oauth_token="${token}"`,
});

export async function getCard(ref: string): Promise<TrelloCard> {
  const creds = credentials();
  const url = new URL(`https://api.trello.com/1/cards/${encodeURIComponent(ref)}`);
  url.searchParams.set("fields", "name,shortUrl");
  url.searchParams.set("attachments", "true");
  url.searchParams.set("attachment_fields", "name,mimeType,bytes,isUpload");
  const res = await fetch(url, { headers: authHeader(creds), cache: "no-store" });
  if (res.status === 404 || res.status === 400) throw new TrelloError("Trello card not found. Check the link.", 404);
  if (res.status === 401) throw new TrelloError("Trello refused the key/token (or they can't see this board).", 502);
  if (!res.ok) throw new TrelloError(`Trello answered ${res.status}.`);
  const data = (await res.json()) as {
    id: string;
    name: string;
    shortUrl: string;
    attachments: (TrelloAttachment & { isUpload: boolean })[];
  };
  return {
    id: data.id,
    name: data.name,
    url: data.shortUrl,
    attachments: data.attachments
      .filter((a) => a.isUpload)
      .map(({ id, name, mimeType, bytes }) => ({ id, name, mimeType: mimeType ?? "", bytes: bytes ?? 0 })),
  };
}

/** Streams one uploaded attachment's bytes. */
export async function downloadAttachment(cardId: string, attachmentId: string): Promise<Response> {
  const creds = credentials();
  const meta = await fetch(
    `https://api.trello.com/1/cards/${cardId}/attachments/${attachmentId}?fields=url,mimeType,isUpload`,
    { headers: authHeader(creds), cache: "no-store" },
  );
  if (!meta.ok) throw new TrelloError("Attachment not found on that card.", 404);
  const { url, mimeType, isUpload } = (await meta.json()) as { url: string; mimeType: string; isUpload: boolean };
  if (!isUpload || !url.startsWith("https://trello.com/")) throw new TrelloError("That attachment is a link, not a file.", 400);
  const file = await fetch(url, { headers: authHeader(creds), cache: "no-store" });
  if (!file.ok || !file.body) throw new TrelloError(`Trello wouldn't send the file (${file.status}).`);
  return new Response(file.body, {
    headers: { "Content-Type": mimeType || file.headers.get("content-type") || "application/octet-stream", "Cache-Control": "no-store" },
  });
}
