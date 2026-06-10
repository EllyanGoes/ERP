export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserModulos } from "@/lib/permissions";
import { empresasParaSessao } from "@/lib/empresa";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null }, { status: 401 });
  const modulos = await getUserModulos(session.sub);
  const { activeEmpresaId, empresas } = await empresasParaSessao(
    session.sub,
    session.perfil,
    session.activeEmpresaId
  );
  return NextResponse.json({
    user: {
      id: session.sub,
      nome: session.nome,
      email: session.email,
      perfil: session.perfil,
      modulos,
      empresas,
      activeEmpresaId,
    },
  });
}
