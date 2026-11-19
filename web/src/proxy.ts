import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Simple shared-password protection (HTTP Basic Auth). Chrome remembers it after the first login.
 * Set DASHBOARD_PASSWORD in Vercel. When unset (local dev), the dashboard is open.
 *
 * The sell-sheet API (/api/hrs) is also called by the Figma plugin, which sends the same password in
 * its own Authorization header. Its CORS preflights carry no credentials, so they pass through, and its
 * 401s skip the WWW-Authenticate header so Figma doesn't pop up a browser login box.
 */
export function proxy(request: NextRequest) {
  const isApi = request.nextUrl.pathname.startsWith("/api/hrs/");
  if (isApi && request.method === "OPTIONS") return NextResponse.next();

  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const supplied = decoded.slice(decoded.indexOf(":") + 1);
    if (supplied === password) return NextResponse.next();
  }

  if (isApi) {
    return NextResponse.json(
      { error: "Wrong dashboard password" },
      { status: 401, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }
  return new NextResponse("Password required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Match Generator"' },
  });
}

export const config = {
  // Logos stay public: the Mac agent downloads them without the password.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logos/).*)"],
};
