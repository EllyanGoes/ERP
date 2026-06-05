"use client";

import Link from "next/link";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import {
  BookOpen, Boxes, Workflow, FlaskConical, Calculator, ClipboardList, ListChecks,
  BarChart3, CalendarClock, ArrowRight, Lightbulb,
} from "lucide-react";

const GLOSSARIO: { t: string; d: string }[] = [
  { t: "Centro de trabalho", d: "Um recurso da produção: forno, secador, prensa… Pode ser ligado a um ativo do Engeman." },
  { t: "Fluxo de produção", d: "O “caminho” pela fábrica (estoques → operações → WIP → produto acabado), desenhado no editor. Um fluxo serve para vários produtos." },
  { t: "WIP (produto em processo)", d: "O material entre as etapas: úmido → seco → queimado → acabado." },
  { t: "Engenharia / Estrutura (BOM)", d: "A “receita” de cada produto: qual fluxo usa + a lista de insumos (argila, água, biomassa, embalagem) com quantidades." },
  { t: "Ordem de Produção (OP)", d: "Uma ordem para produzir X de um produto, seguindo um fluxo publicado. Vem com as etapas para apontar." },
  { t: "Apontamento", d: "Registrar, por etapa, o que foi produzido: entrada, saída, perda, biomassa e subproduto." },
  { t: "MPS / MRP", d: "MPS = o que produzir (demanda). MRP = explode a demanda pela estrutura e mostra o que falta comprar." },
  { t: "Gargalo", d: "O forno (e a secagem) — a restrição que define o ritmo da fábrica." },
];

const PASSOS: { n: number; t: string; href?: string }[] = [
  { n: 1, t: "Cadastre os recursos", href: "/pcp/centros-trabalho" },
  { n: 2, t: "Desenhe e publique o fluxo", href: "/pcp/fluxos" },
  { n: 3, t: "Monte a engenharia (BOM) por produto", href: "/pcp/engenharia" },
  { n: 4, t: "Informe a demanda (MPS) e rode o MRP", href: "/pcp/planejamento" },
  { n: 5, t: "Abra e libere as ordens", href: "/pcp/ordens" },
  { n: 6, t: "O chão aponta as etapas (fila)", href: "/pcp/operacoes" },
  { n: 7, t: "Acompanhe e programe o forno", href: "/pcp/dashboard" },
];

const TELAS: { icon: typeof Boxes; t: string; href: string; d: string }[] = [
  { icon: Boxes, t: "Centros de Trabalho", href: "/pcp/centros-trabalho", d: "Cadastre forno, secador e outros recursos (com capacidade e vínculo opcional ao Engeman)." },
  { icon: Workflow, t: "Fluxos de Produção", href: "/pcp/fluxos", d: "Editor visual: arraste nós (estoque/operação/WIP/PA), conecte, configure e publique. Um fluxo serve vários produtos." },
  { icon: FlaskConical, t: "Engenharia do Produto", href: "/pcp/engenharia", d: "Por produto: o fluxo que ele usa + a lista de insumos (argila, água, biomassa, pallet/fita/grampo) com quantidades." },
  { icon: Calculator, t: "Planejamento (MPS/MRP)", href: "/pcp/planejamento", d: "Informe a demanda por produto/mês e calcule as necessidades de insumos (o que falta comprar)." },
  { icon: ClipboardList, t: "Ordens de Produção", href: "/pcp/ordens", d: "Abra ordens de um fluxo publicado, libere e acompanhe etapas, lead time e movimentações." },
  { icon: ListChecks, t: "Operações (fila)", href: "/pcp/operacoes", d: "As etapas a executar, por centro de trabalho. O operador aponta o que produziu (perda, biomassa, subproduto)." },
  { icon: BarChart3, t: "Dashboard", href: "/pcp/dashboard", d: "Indicadores: perdas, biomassa/milheiro, produção por estágio, a comprar e simulação de capacidade do forno." },
  { icon: CalendarClock, t: "Sequenciamento (forno)", href: "/pcp/sequenciamento", d: "Programa o gargalo: em que ordem e quando cada OP passa no forno (capacidade finita)." },
];

const CAMINHO = [
  "Cadastre o Forno (ex.: 20 milheiros/ciclo) em Centros de Trabalho.",
  "Em Fluxos, “Criar exemplo” → ajuste a queima (estado de saída, ciclo em horas, subproduto = caco) → Publicar.",
  "Em Engenharia, ligue o produto ao fluxo + insumos (argila 2000/milheiro, 1 pallet/milheiro…).",
  "Em Planejamento, lance a demanda (ex.: 200 milheiros) → Calcular MRP → veja o “a comprar”.",
  "Em Ordens, nova ordem do fluxo → Liberar.",
  "Em Operações, o chão aponta cada etapa (entrada/saída/perda/biomassa/subproduto) → Concluir.",
  "Veja o WIP e o caco em Almoxarifado → Posição de Estoque (local “Produção (WIP)”).",
];

const FAQ: { q: string; a: string }[] = [
  { q: "Um fluxo serve para vários produtos?", a: "Sim. O fluxo é o caminho; a Engenharia é o que muda entre produtos (insumos e quantidades)." },
  { q: "Onde vejo o produto em processo (WIP)?", a: "Em Almoxarifado → Posição de Estoque, no local “Produção (WIP)”. Os itens de WIP são criados automaticamente e não entram no catálogo de venda." },
  { q: "Por que minha ordem não aparece na fila?", a: "A ordem precisa estar Liberada e o fluxo, Publicado." },
  { q: "O MRP não explodiu meu produto.", a: "Falta a Engenharia (BOM) dele — cadastre em Engenharia do Produto." },
  { q: "Editei o fluxo depois de publicado, e agora?", a: "Editar cria uma nova versão; as ordens já abertas continuam na versão que usaram." },
];

export default function AjudaPcpPage() {
  useTabTitle("Como usar o PCP");
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Como usar o PCP"
        subtitle="Guia rápido do módulo de Planejamento e Controle da Produção."
        breadcrumbs={[{ label: "PCP" }, { label: "Como usar" }]}
      />
      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-10 space-y-6 max-w-4xl">
        {/* Intro */}
        <div className="rounded-xl border border-cyan-200 bg-cyan-50/50 p-4 flex items-start gap-3">
          <BookOpen className="w-5 h-5 text-cyan-600 mt-0.5 shrink-0" />
          <p className="text-sm text-gray-700">
            O <strong>PCP</strong> organiza a produção da matéria-prima ao produto acabado, com o
            <strong> forno como o ponto central</strong>. Você desenha o processo, define a receita de
            cada produto, planeja a demanda, abre ordens, aponta no chão e acompanha os números — com
            o <strong>WIP virando saldo no estoque automaticamente</strong>.
          </p>
        </div>

        {/* Primeiros passos */}
        <section>
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-3">Primeiros passos (configure uma vez, nesta ordem)</h2>
          <div className="space-y-1.5">
            {PASSOS.map((p) => (
              <Link key={p.n} href={p.href ?? "#"} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 hover:border-cyan-300 group">
                <span className="flex w-6 h-6 items-center justify-center rounded-full bg-cyan-600 text-white text-xs font-bold shrink-0">{p.n}</span>
                <span className="text-sm text-gray-700 flex-1">{p.t}</span>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-cyan-500" />
              </Link>
            ))}
          </div>
        </section>

        {/* Glossário */}
        <section>
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-3">Conceitos-chave</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {GLOSSARIO.map((g) => (
              <div key={g.t} className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-sm font-semibold text-gray-800">{g.t}</p>
                <p className="text-xs text-gray-500 mt-0.5">{g.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Tela a tela */}
        <section>
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-3">Tela a tela</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {TELAS.map((t) => (
              <Link key={t.href} href={t.href} className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 hover:border-cyan-300 group">
                <span className="flex w-8 h-8 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600 shrink-0"><t.icon className="w-4 h-4" /></span>
                <span className="min-w-0">
                  <span className="text-sm font-semibold text-gray-800 group-hover:text-cyan-700 flex items-center gap-1">{t.t}<ArrowRight className="w-3 h-3 text-gray-300 group-hover:text-cyan-500" /></span>
                  <span className="block text-xs text-gray-500 mt-0.5">{t.d}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Caminho completo */}
        <section>
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-3">O caminho completo (exemplo)</h2>
          <ol className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
            {CAMINHO.map((c, i) => (
              <li key={i} className="flex items-start gap-3 px-4 py-2.5">
                <span className="flex w-5 h-5 items-center justify-center rounded-full bg-gray-100 text-gray-500 text-[11px] font-semibold shrink-0 mt-0.5">{i + 1}</span>
                <span className="text-sm text-gray-700">{c}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* FAQ */}
        <section>
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-3">Dúvidas frequentes</h2>
          <div className="space-y-2">
            {FAQ.map((f) => (
              <div key={f.q} className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-sm font-medium text-gray-800 flex items-start gap-1.5"><Lightbulb className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" /> {f.q}</p>
                <p className="text-xs text-gray-500 mt-1 ml-5">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <p className="text-[11px] text-gray-400">Guia completo também disponível no repositório em <code>docs/pcp/GUIA.md</code>.</p>
      </div>
    </div>
  );
}
