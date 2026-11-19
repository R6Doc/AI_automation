import "server-only";
import { StoreNotConfigured } from "@/lib/hrs-store";

/** The Figma plugin calls the API from its own (null) origin, sending the dashboard password itself. */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: CORS });

export const preflight = () => new Response(null, { status: 204, headers: CORS });

/** Runs a handler and turns thrown errors into JSON the dashboard and plugin can show. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, e instanceof StoreNotConfigured ? 503 : 500);
  }
}
