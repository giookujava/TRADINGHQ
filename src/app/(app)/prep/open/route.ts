import { NextResponse, type NextRequest } from "next/server";

/** GET /prep/open?d=YYYY-MM-DD → /prep/YYYY-MM-DD (date picker convenience). */
export function GET(request: NextRequest) {
  const d = request.nextUrl.searchParams.get("d") ?? "";
  const target = /^\d{4}-\d{2}-\d{2}$/.test(d) ? `/prep/${d}` : "/prep";
  return NextResponse.redirect(new URL(target, request.url));
}
