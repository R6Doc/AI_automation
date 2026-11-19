import "server-only";
import { del, get, list, put } from "@vercel/blob";
import fs from "node:fs/promises";
import path from "node:path";
import type { Batch, BatchSummary } from "@/lib/sellsheet";

/**
 * Where sell-sheet batches wait until the Figma plugin picks them up.
 * On Vercel: a Blob store (BLOB_READ_WRITE_TOKEN is added when you connect one). Everything is read
 * back through this app's API, so the store can be private (BLOB_ACCESS=public if yours is public).
 * Locally without a token: files in web/.hrs-data/.
 *
 * Layout: hrs/<batchId>/batch.json and hrs/<batchId>/photo-<n>
 */

const blobEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const access = () => (process.env.BLOB_ACCESS === "public" ? "public" : "private");
const LOCAL_ROOT = path.join(process.cwd(), ".hrs-data");

export class StoreNotConfigured extends Error {}

function check() {
  if (!blobEnabled() && process.env.VERCEL) {
    throw new StoreNotConfigured("No Blob store connected. In Vercel: Storage → Create → Blob, then connect it to this project and redeploy.");
  }
}

async function putFile(pathname: string, body: Blob | string, contentType: string) {
  check();
  if (blobEnabled()) {
    await put(pathname, body, { access: access(), contentType, addRandomSuffix: false, allowOverwrite: true });
    return;
  }
  const file = path.join(LOCAL_ROOT, pathname);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, typeof body === "string" ? body : Buffer.from(await body.arrayBuffer()));
}

async function getFile(pathname: string): Promise<{ body: ReadableStream | Buffer; contentType: string } | null> {
  check();
  if (blobEnabled()) {
    const res = await get(pathname, { access: access(), useCache: false });
    if (!res || !res.stream) return null;
    return { body: res.stream, contentType: res.blob.contentType ?? "application/octet-stream" };
  }
  try {
    const body = await fs.readFile(path.join(LOCAL_ROOT, pathname));
    return { body, contentType: pathname.endsWith(".json") ? "application/json" : sniffImage(body) };
  } catch {
    return null;
  }
}

const sniffImage = (b: Buffer) =>
  b[0] === 0x89 ? "image/png" : b[0] === 0xff ? "image/jpeg" : b[0] === 0x47 ? "image/gif" : "application/octet-stream";

async function readText(pathname: string) {
  const file = await getFile(pathname);
  if (!file) return null;
  return Buffer.isBuffer(file.body) ? file.body.toString("utf8") : await new Response(file.body).text();
}

export const savePhoto = (id: string, index: number, photo: Blob) =>
  putFile(`hrs/${id}/photo-${index}`, photo, photo.type);

export const getPhoto = (id: string, index: number) => getFile(`hrs/${id}/photo-${index}`);

export const saveBatch = (batch: Batch) =>
  putFile(`hrs/${batch.id}/batch.json`, JSON.stringify(batch), "application/json");

export async function getBatch(id: string): Promise<Batch | null> {
  const text = await readText(`hrs/${id}/batch.json`);
  return text ? (JSON.parse(text) as Batch) : null;
}

/** Batch ids that have a batch.json (photos uploaded for a batch that was never saved don't count). */
async function batchIds(): Promise<string[]> {
  check();
  if (blobEnabled()) {
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: "hrs/", cursor });
      for (const b of page.blobs) {
        const m = b.pathname.match(/^hrs\/([^/]+)\/batch\.json$/);
        if (m) ids.push(m[1]);
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return ids;
  }
  try {
    const dirs = await fs.readdir(path.join(LOCAL_ROOT, "hrs"));
    const ok = await Promise.all(dirs.map((d) => fs.access(path.join(LOCAL_ROOT, "hrs", d, "batch.json")).then(() => true, () => false)));
    return dirs.filter((_, i) => ok[i]);
  } catch {
    return [];
  }
}

export async function listBatches(): Promise<BatchSummary[]> {
  const batches = await Promise.all((await batchIds()).map(getBatch));
  return batches
    .filter((b): b is Batch => b !== null)
    .map(({ id, name, createdAt, sheets }) => ({ id, name, createdAt, count: sheets.length }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteBatch(id: string) {
  check();
  if (blobEnabled()) {
    const { blobs } = await list({ prefix: `hrs/${id}/` });
    if (blobs.length) await del(blobs.map((b) => b.url));
    return;
  }
  await fs.rm(path.join(LOCAL_ROOT, "hrs", id), { recursive: true, force: true });
}
