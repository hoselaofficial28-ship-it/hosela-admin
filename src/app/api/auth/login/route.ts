import { NextRequest, NextResponse } from "next/server";
import { verifyLogin, createToken, COOKIE_NAME } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const username = (body.username || "").trim().toLowerCase();
  const password = (body.password || "").trim();

  if (!username || !password) {
    return NextResponse.json({ error: "Username dan password wajib diisi" }, { status: 400 });
  }

  const { user, error } = await verifyLogin(username, password);
  if (!user) {
    return NextResponse.json({ error: error || "Username atau password salah" }, { status: 401 });
  }

  const token = createToken(user);
  const response = NextResponse.json({ user });

  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  return response;
}
