export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signToken, COOKIE_NAME, SessionPayload } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code  = searchParams.get("code");
  const state = searchParams.get("state") ?? "/dashboard";
  const error = searchParams.get("error");

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  if (error || !code) {
    return NextResponse.redirect(`${baseUrl}/login?error=google_cancelled`);
  }

  try {
    // 1. Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri:  `${baseUrl}/api/auth/google/callback`,
        grant_type:    "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(`${baseUrl}/login?error=google_token`);
    }

    const { access_token } = await tokenRes.json();

    // 2. Fetch user info
    const userRes  = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!userRes.ok) {
      return NextResponse.redirect(`${baseUrl}/login?error=google_userinfo`);
    }

    const googleUser: { id: string; email: string; name: string } = await userRes.json();

    // 3. Find or create user
    let user = await prisma.usuario.findUnique({
      where:   { email: googleUser.email.toLowerCase() },
      include: { permissoes: true },
    });

    if (!user) {
      // Auto-create user with USUARIO profile — admin can set permissions later
      user = await prisma.usuario.create({
        data: {
          email:  googleUser.email.toLowerCase(),
          nome:   googleUser.name,
          senha:  "", // no password for Google users
          perfil: "USUARIO",
          ativo:  true,
        },
        include: { permissoes: true },
      });
    }

    if (!user.ativo) {
      return NextResponse.redirect(`${baseUrl}/login?error=conta_inativa`);
    }

    // 4. Issue JWT cookie (same flow as email/password login)
    const modulos = user.perfil === "ADMIN"
      ? ["*"]
      : user.permissoes.map((p) => p.modulo);

    const payload: SessionPayload = {
      sub:    user.id,
      email:  user.email,
      nome:   user.nome,
      perfil: user.perfil,
      modulos,
    };

    const token = signToken(payload);

    const res = NextResponse.redirect(`${baseUrl}${state}`);
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   60 * 60 * 8,
      path:     "/",
    });

    return res;
  } catch (err) {
    console.error("[Google OAuth callback]", err);
    return NextResponse.redirect(`${baseUrl}/login?error=google_error`);
  }
}
