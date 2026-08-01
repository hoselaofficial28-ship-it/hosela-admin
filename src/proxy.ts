import { NextRequest, NextResponse } from "next/server";

export function proxy(req: NextRequest) {
  const token = req.cookies.get("hosela_session")?.value;
  const { pathname } = req.nextUrl;

  if (pathname === "/login" || pathname === "/register" || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon|api/auth).*)"],
};
