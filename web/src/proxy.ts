import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Simple shared-password protection (HTTP Basic Auth). Chrome remembers it after the first login.
 * Set DASHBOARD_PASSWORD in Vercel. When unset (local dev), the dashboard is open.
 */
export function proxy(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const supplied = decoded.slice(decoded.indexOf(":") + 1);
    if (supplied === password) return NextResponse.next();
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
