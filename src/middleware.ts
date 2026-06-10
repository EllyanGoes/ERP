import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Fail-closed: sem JWT_SECRET configurado, nenhum token pode ser confiável.
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET não configurado — defina a variável de ambiente.");
}
const SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const COOKIE_NAME = "erp_session";

// Caminhos liberados sem sessão de usuário. As rotas de API listadas validam
// a própria autenticação (ou são públicas por natureza):
//   /login          → página de login
//   /api/auth/*     → login/logout/google/callback são públicos; me/refresh
//                     fazem getSession() e respondem 401 sozinhos
//   /api/cron/*     → protegidas por CRON_SECRET (Authorization: Bearer)
//   /api/webhooks/* → validam o segredo do provedor (Telegram/Meta)
// Qualquer OUTRA rota /api/* agora exige um JWT de sessão válido.
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/api/cron", "/api/webhooks"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Caminhos públicos / que cuidam da própria auth (internos do Next já saem pelo matcher)
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (token) {
    try {
      await jwtVerify(token, SECRET);
      return NextResponse.next();
    } catch {
      // token inválido/expirado → segue como não autenticado
    }
  }

  // Não autenticado: APIs recebem 401 JSON; páginas redirecionam ao /login.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const url = new URL("/login", request.url);
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts|globals.css).*)",
  ],
};
