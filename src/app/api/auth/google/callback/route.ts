export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signToken, COOKIE_NAME, SessionPayload, SESSAO_MAX_AGE_S, parseUserAgent } from "@/lib/auth";
import { empresasParaSessao } from "@/lib/empresa";
import { randomUUID } from "crypto";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code  = searchParams.get("code");
  const error = searchParams.get("error");

  // O state carrega o caminho de retorno. Só aceita caminho interno ("/...",
  // mas não "//host"), senão um link malicioso redirecionaria para outro site.
  const rawState = searchParams.get("state") ?? "/dashboard";
  const state = rawState.startsWith("/") && !rawState.startsWith("//") ? rawState : "/dashboard";

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

    // 3. Find user — só entra quem já foi cadastrado por um administrador.
    // (Auto-criar usuário aqui deixava qualquer conta Google entrar no ERP.)
    const user = await prisma.usuario.findUnique({
      where:   { email: googleUser.email.toLowerCase() },
      include: { permissoes: true },
    });

    if (!user) {
      return NextResponse.redirect(`${baseUrl}/login?error=sem_cadastro`);
    }

    if (!user.ativo) {
      return NextResponse.redirect(`${baseUrl}/login?error=conta_inativa`);
    }

    // 4. Issue JWT cookie (same flow as email/password login)
    // O token carrega só identidade — módulos vêm do banco (evita cookie > 4KB).
    const { activeEmpresaId, empresaIds } = await empresasParaSessao(user.id, user.perfil);

    // Registra a sessão/dispositivo (gestão de dispositivos).
    const jti = randomUUID();
    const ua = req.headers.get("user-agent");
    const ipG = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
    const { dispositivo, navegador, so } = parseUserAgent(ua);
    await prisma.usuarioSessao.create({
      data: { id: jti, usuarioId: user.id, userAgent: ua ?? null, dispositivo, navegador, so, ip: ipG, expiraEm: new Date(Date.now() + SESSAO_MAX_AGE_S * 1000) },
    }).catch(() => { /* não bloqueia o login */ });

    const payload: SessionPayload = {
      sub:    user.id,
      email:  user.email,
      nome:   user.nome,
      perfil: user.perfil,
      activeEmpresaId,
      empresaIds,
      jti,
    };

    const token = signToken(payload);

    const res = NextResponse.redirect(`${baseUrl}${state}`);
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   SESSAO_MAX_AGE_S,
      path:     "/",
    });

    return res;
  } catch (err) {
    console.error("[Google OAuth callback]", err);
    return NextResponse.redirect(`${baseUrl}/login?error=google_error`);
  }
}
