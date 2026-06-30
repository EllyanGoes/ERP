import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import ClienteDetail from "@/components/clientes/ClienteDetail";
import EditarTabButton from "@/components/shared/EditarTabButton";
import ImportarParaConcorrente from "@/components/clientes/ImportarParaConcorrente";
import { decimalToNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ClienteDetailPage({ params }: { params: { id: string } }) {
  const [cliente, movimentacoesRaw, contasDoCliente] = await Promise.all([
    prisma.cliente.findUnique({
      where: { id: params.id },
      include: {
        pedidosVenda: { orderBy: { createdAt: "desc" }, take: 20, include: { cliente: { select: { razaoSocial: true } } } },
        contasReceber: { orderBy: { dataVencimento: "asc" }, take: 20 },
      },
    }),
    prisma.movimentacaoComodato.findMany({
      where: { clienteId: params.id },
      orderBy: { data: "desc" },
      include: { item: { select: { id: true, codigo: true, descricao: true } } },
    }),
    // Contas contábeis do cliente na empresa ativa: Clientes a Receber (ATIVO,
    // 1.1.2.x) e Material a Entregar (PASSIVO, 2.1.2.x) — mesmo clienteId, grupos distintos.
    prisma.contaContabil.findMany({
      where: { clienteId: params.id, grupo: { in: ["ATIVO", "PASSIVO"] } },
      select: { id: true, codigo: true, nome: true, natureza: true, grupo: true },
    }),
  ]);
  if (!cliente) notFound();

  // Razonete (movimentos + saldo) de cada conta contábil do cliente.
  const contasContabeis = await Promise.all(
    contasDoCliente
      .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }))
      .map(async (cc) => {
        const partidas = await prisma.partidaContabil.findMany({
          where: { contaId: cc.id },
          select: { tipo: true, valor: true, lancamento: { select: { data: true, historico: true } } },
          orderBy: { lancamento: { data: "asc" } },
        });
        const dev = cc.natureza === "DEVEDORA";
        let saldo = 0;
        const movimentos = partidas.map((p) => {
          const v = decimalToNumber(p.valor);
          const debito = p.tipo === "DEBITO" ? v : 0;
          const credito = p.tipo === "CREDITO" ? v : 0;
          saldo += dev ? debito - credito : credito - debito;
          return { data: p.lancamento.data, historico: p.lancamento.historico, debito, credito, saldo };
        });
        return {
          id: cc.id, codigo: cc.codigo, nome: cc.nome,
          natureza: cc.natureza as "DEVEDORA" | "CREDORA",
          grupo: cc.grupo as "ATIVO" | "PASSIVO",
          saldo, movimentos,
        };
      }),
  );
  const contaContabil = contasContabeis.find((c) => c.grupo === "ATIVO");

  // Vínculo: este cliente também está cadastrado como fornecedor? (mesmo CPF/CNPJ)
  const cnpjDigits = (cliente.cpfCnpj ?? "").replace(/\D/g, "");
  const fornecedorVinculo =
    cnpjDigits.length >= 11
      ? (
          await prisma.$queryRawUnsafe<{ id: string; razaoSocial: string; nomeFantasia: string | null }[]>(
            `SELECT id, "razaoSocial", "nomeFantasia" FROM "Fornecedor"
             WHERE regexp_replace(coalesce("cpfCnpj", ''), '\\D', '', 'g') = $1 LIMIT 1`,
            cnpjDigits,
          )
        )[0] ?? null
      : null;

  const contaContabilLabel = contaContabil ? `${contaContabil.codigo} — ${contaContabil.nome}` : null;
  const contasResumo = contasContabeis.map((c) => ({
    id: c.id, codigo: c.codigo, nome: c.nome, natureza: c.natureza, grupo: c.grupo, saldo: c.saldo,
    movimentos: c.movimentos.map((m) => ({ data: m.data, historico: m.historico, debito: m.debito, credito: m.credito, saldo: m.saldo })),
  }));

  // Movimentações de comodato deste cliente (saldo é calculado no componente).
  const comodato = movimentacoesRaw.map((m) => ({
    id: m.id,
    itemId: m.itemId,
    tipo: m.tipo as "SAIDA" | "RETORNO",
    quantidade: decimalToNumber(m.quantidade),
    valorUnitario: decimalToNumber(m.valorUnitario),
    item: m.item,
  }));

  // Este cliente já foi importado como concorrente?
  const concorrenteVinc = await prisma.concorrente.findFirst({
    where: { clienteId: params.id },
    select: { id: true },
  });

  return (
    <div>
      <PageHeader
        title={cliente.nomeFantasia || cliente.razaoSocial}
        breadcrumbs={[{ label: "Clientes", href: "/clientes" }, { label: cliente.razaoSocial }]}
        action={
          <div className="flex items-center gap-2">
            {concorrenteVinc ? (
              <Link
                href={`/marketing/inteligencia-comercial/${concorrenteVinc.id}`}
                className="rounded-full border border-fuchsia-300 bg-fuchsia-50 dark:bg-fuchsia-500/15 px-3 py-1 text-xs font-medium text-fuchsia-700 dark:text-fuchsia-300 hover:bg-fuchsia-100"
                title="Este cliente já está mapeado na Inteligência Comercial"
              >
                Mapeado ↗
              </Link>
            ) : (
              <ImportarParaConcorrente clienteId={cliente.id} />
            )}
            {fornecedorVinculo && (
              <Link href={`/suprimentos/fornecedores/${fornecedorVinculo.id}`}
                className="rounded-full border border-indigo-300 bg-indigo-50 dark:bg-indigo-500/15 px-3 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:bg-indigo-500/25"
                title="Mesmo CPF/CNPJ cadastrado como fornecedor">
                Também é fornecedor ↗
              </Link>
            )}
            <StatusBadge status={cliente.status} />
            <EditarTabButton href={`/clientes/${cliente.id}/editar`} />
          </div>
        }
      />
      <div className="px-8 pb-8">
        <ClienteDetail cliente={cliente as any} comodato={comodato} contaContabil={contaContabilLabel} contasContabeis={contasResumo} />
      </div>
    </div>
  );
}
