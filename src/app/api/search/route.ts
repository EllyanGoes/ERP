export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Resultado normalizado consumido pelo command palette (Cmd+K).
export type SearchResult = {
  tipo: "produto" | "cliente" | "fornecedor" | "pedido-venda" | "pedido-compra";
  id: string;
  titulo: string;
  subtitulo?: string;
  codigo?: string;
  href: string;
};

const TAKE = 5; // máximo de resultados por tipo

// GET /api/search?q=...
// Busca unificada e enxuta para o atalho Cmd+K: consulta os principais modelos
// em paralelo e devolve no máximo TAKE itens por tipo, só com os campos usados
// para exibir e navegar (nada de includes pesados).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();

  if (q.length < 2) return NextResponse.json({ results: [] });

  const ci = { contains: q, mode: "insensitive" as const };
  const qDigits = q.replace(/\D/g, "");
  // Só busca por CPF/CNPJ quando o termo parece um documento (só dígitos/pontuação,
  // sem letras). Senão "PROD-0001" viraria busca por "0001" — que casa com quase
  // todo CNPJ (sufixo /0001 da matriz) e poluiria os resultados.
  const buscaDocumento = qDigits.length >= 2 && !/[a-zA-ZÀ-ÿ]/.test(q);
  const cpfOr = buscaDocumento ? [{ cpfCnpj: { contains: qDigits } }] : [];

  const [produtos, clientes, fornecedores, pedidosVenda, pedidosCompra] = await Promise.all([
    prisma.item.findMany({
      where: { OR: [{ codigo: ci }, { descricao: ci }] },
      select: { id: true, codigo: true, descricao: true },
      take: TAKE,
      orderBy: { codigo: "asc" },
    }),
    prisma.cliente.findMany({
      where: { OR: [{ razaoSocial: ci }, { nomeFantasia: ci }, ...cpfOr] },
      select: { id: true, razaoSocial: true, nomeFantasia: true, cpfCnpj: true },
      take: TAKE,
      orderBy: { razaoSocial: "asc" },
    }),
    prisma.fornecedor.findMany({
      where: { OR: [{ razaoSocial: ci }, { nomeFantasia: ci }, ...cpfOr] },
      select: { id: true, razaoSocial: true, nomeFantasia: true, cpfCnpj: true },
      take: TAKE,
      orderBy: { razaoSocial: "asc" },
    }),
    prisma.pedidoVenda.findMany({
      where: { OR: [{ numero: ci }, { cliente: { razaoSocial: ci } }, { cliente: { nomeFantasia: ci } }] },
      select: { id: true, numero: true, cliente: { select: { razaoSocial: true, nomeFantasia: true } } },
      take: TAKE,
      orderBy: { numero: "desc" },
    }),
    prisma.pedidoCompra.findMany({
      where: { OR: [{ numero: ci }, { fornecedor: { razaoSocial: ci } }, { fornecedor: { nomeFantasia: ci } }] },
      select: { id: true, numero: true, fornecedor: { select: { razaoSocial: true, nomeFantasia: true } } },
      take: TAKE,
      orderBy: { numero: "desc" },
    }),
  ]);

  const results: SearchResult[] = [
    ...produtos.map((p) => ({
      tipo: "produto" as const,
      id: p.id,
      titulo: p.descricao,
      codigo: p.codigo,
      href: `/suprimentos/produtos/${p.id}`,
    })),
    ...clientes.map((c) => ({
      tipo: "cliente" as const,
      id: c.id,
      titulo: c.nomeFantasia || c.razaoSocial,
      subtitulo: c.cpfCnpj || undefined,
      href: `/clientes/${c.id}`,
    })),
    ...fornecedores.map((f) => ({
      tipo: "fornecedor" as const,
      id: f.id,
      titulo: f.nomeFantasia || f.razaoSocial,
      subtitulo: f.cpfCnpj || undefined,
      href: `/suprimentos/fornecedores/${f.id}`,
    })),
    ...pedidosVenda.map((pv) => ({
      tipo: "pedido-venda" as const,
      id: pv.id,
      titulo: pv.numero,
      subtitulo: pv.cliente?.nomeFantasia || pv.cliente?.razaoSocial || undefined,
      href: `/pedidos-venda/${pv.id}`,
    })),
    ...pedidosCompra.map((pc) => ({
      tipo: "pedido-compra" as const,
      id: pc.id,
      titulo: pc.numero,
      subtitulo: pc.fornecedor?.nomeFantasia || pc.fornecedor?.razaoSocial || undefined,
      href: `/suprimentos/pedidos-compra/${pc.id}`,
    })),
  ];

  return NextResponse.json({ results });
}
