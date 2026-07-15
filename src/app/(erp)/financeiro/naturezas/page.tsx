"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Autoria } from "@/components/shared/Autoria";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Pencil, Trash2, Loader2, Info, ArrowDownLeft, ArrowUpRight, FolderClosed, ChevronDown, Tag, Lock,
  Download, Copy, FileText, Check, Search, ChevronRight, CornerDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { gerarPdfContabil, type LinhaPdf } from "@/lib/pdf-contabil";

const GRUPOS = ["RECEITA_OPERACIONAL", "CUSTO_OPERACIONAL", "DESPESA_OPERACIONAL", "INVESTIMENTO", "FINANCIAMENTO"] as const;
type Grupo = (typeof GRUPOS)[number];
const GRUPO_LABEL: Record<Grupo, string> = {
  RECEITA_OPERACIONAL: "Receitas operacionais",
  CUSTO_OPERACIONAL: "Custos operacionais",
  DESPESA_OPERACIONAL: "Despesas operacionais",
  INVESTIMENTO: "Atividades de investimento",
  FINANCIAMENTO: "Atividades de financiamento",
};

const COLLAPSE_KEY = "financeiro:naturezas:collapsed";

type Tipo = "ENTRADA" | "SAIDA";
type Subgrupo = { id: string; nome: string; grupo: Grupo };
type ContaResultado = { id: string; codigo: string; nome: string };
type ContaPatrimonial = { id: string; codigo: string; nome: string; grupo: "ATIVO" | "PASSIVO"; porBeneficiario?: boolean };
type Natureza = {
  id: string; nome: string; tipo: Tipo; grupo: Grupo;
  subgrupoId: string | null; subgrupo: { id: string; nome: string } | null; ativo: boolean;
  cif: boolean;
  // Natureza padrão TRAVADA do sistema (cadeado): não edita campos-chave nem exclui.
  sistema?: boolean;
  destinoSugerido: string | null;
  aplicavelRequisicao: boolean;
  contaContabilId: string | null; contaContabil: ContaResultado | null;
  contaContrapartidaId: string | null; contaContrapartida: ContaResultado | null;
  criadoPor?: string | null;
  atualizadoPor?: string | null;
};

export default function NaturezasPage() {
  const [rows, setRows] = useState<Natureza[]>([]);
  const [subgrupos, setSubgrupos] = useState<Subgrupo[]>([]);
  const [contasResultado, setContasResultado] = useState<ContaResultado[]>([]);
  const [contasPatrimoniais, setContasPatrimoniais] = useState<ContaPatrimonial[]>([]);
  const [loading, setLoading] = useState(true);

  // null = fechado; objeto vazio = novo; objeto preenchido = edição
  const [natModal, setNatModal] = useState<Natureza | "new" | null>(null);
  const [subModal, setSubModal] = useState<Subgrupo | "new" | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Filtros
  const [search, setSearch] = useState("");
  const [filtroGrupo, setFiltroGrupo] = useState<"" | Grupo>("");
  const [filtroTipo, setFiltroTipo] = useState<"" | Tipo>("");
  const [filtroAtivo, setFiltroAtivo] = useState<"" | "true" | "false">("");

  // Árvore: grupos/subgrupos recolhidos (persistido no localStorage).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const [n, s] = await Promise.all([
      fetch("/api/financeiro/naturezas?comContas=1").then((r) => r.json()),
      fetch("/api/financeiro/naturezas/subgrupos").then((r) => r.json()),
    ]);
    setRows(n.data ?? []);
    setContasResultado(n.contasResultado ?? []);
    setContasPatrimoniais(n.contasPatrimoniais ?? []);
    setSubgrupos(s.data ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Carrega o estado recolhido persistido.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }
  }, []);

  const persistCollapsed = useCallback((next: Set<string>) => {
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
  }, []);
  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
      return next;
    });
  }, []);

  async function excluirNatureza(r: Natureza) {
    if (!confirm(`Excluir a natureza "${r.nome}"?`)) return;
    await fetch(`/api/financeiro/naturezas/${r.id}`, { method: "DELETE" });
    await load();
  }
  async function excluirSubgrupo(s: Subgrupo) {
    if (!confirm(`Excluir o subgrupo "${s.nome}"? As naturezas dentro dele ficarão sem subgrupo.`)) return;
    await fetch(`/api/financeiro/naturezas/subgrupos/${s.id}`, { method: "DELETE" });
    await load();
  }

  // Grupos que têm algum conteúdo (natureza ou subgrupo) — base para exportação (sem filtro)
  const gruposComConteudo = GRUPOS.filter(
    (g) => rows.some((r) => r.grupo === g) || subgrupos.some((s) => s.grupo === g),
  );
  const semConteudo = gruposComConteudo.length === 0;

  // ── Filtro + montagem da árvore ──────────────────────────────────────────────
  const temFiltro = !!(search.trim() || filtroGrupo || filtroTipo || filtroAtivo);

  const naturezasFiltradas = useMemo(() => {
    const termo = search.trim().toLowerCase();
    return rows.filter((n) => {
      if (termo && !n.nome.toLowerCase().includes(termo)) return false;
      if (filtroGrupo && n.grupo !== filtroGrupo) return false;
      if (filtroTipo && n.tipo !== filtroTipo) return false;
      if (filtroAtivo === "true" && !n.ativo) return false;
      if (filtroAtivo === "false" && n.ativo) return false;
      return true;
    });
  }, [rows, search, filtroGrupo, filtroTipo, filtroAtivo]);

  // Árvore: grupo → (subgrupos + naturezas soltas). Com filtro, esconde grupos/subgrupos vazios.
  const arvore = useMemo(() => {
    return GRUPOS
      .filter((g) => !filtroGrupo || g === filtroGrupo)
      .map((g) => {
        const naturezasGrupo = naturezasFiltradas.filter((n) => n.grupo === g);
        const semSubgrupo = naturezasGrupo.filter((n) => !n.subgrupoId);
        const subs = subgrupos
          .filter((s) => s.grupo === g)
          .map((s) => ({ sub: s, naturezas: naturezasGrupo.filter((n) => n.subgrupoId === s.id) }))
          // sem filtro, mostra todos os subgrupos (mesmo vazios); com filtro, só os com naturezas
          .filter((x) => (temFiltro ? x.naturezas.length > 0 : true));
        return { grupo: g, total: naturezasGrupo.length, semSubgrupo, subs };
      })
      // grupo só aparece se tem natureza correspondente, ou (sem filtro) se tem qualquer conteúdo
      .filter((sec) =>
        temFiltro ? sec.total > 0 : sec.total > 0 || sec.subs.length > 0,
      );
  }, [naturezasFiltradas, subgrupos, filtroGrupo, temFiltro]);

  const recolherTudo = useCallback(() => {
    const ids: string[] = [];
    for (const g of GRUPOS) {
      ids.push(g);
      for (const s of subgrupos.filter((x) => x.grupo === g)) ids.push(`sub:${s.id}`);
    }
    persistCollapsed(new Set(ids));
  }, [subgrupos, persistCollapsed]);
  const expandirTudo = useCallback(() => persistCollapsed(new Set()), [persistCollapsed]);

  const limparFiltros = () => { setSearch(""); setFiltroGrupo(""); setFiltroTipo(""); setFiltroAtivo(""); };

  const totalNat = rows.length;
  const ativas = rows.filter((n) => n.ativo).length;
  const inativas = totalNat - ativas;

  // ── Exportação (texto p/ copiar e PDF) ──────────────────────────────────────
  const tipoLabel = (t: Tipo) => (t === "ENTRADA" ? "Entrada" : "Saída");
  const contaTxt = (c: ContaResultado | null) => (c ? `${c.codigo} ${c.nome}` : "—");
  // Percorre a árvore na ordem da tela e chama os callbacks (fonte única).
  function percorrerEstrutura(cb: {
    grupo: (label: string) => void;
    subgrupo: (nome: string) => void;
    natureza: (n: Natureza) => void;
  }) {
    for (const g of gruposComConteudo) {
      cb.grupo(GRUPO_LABEL[g]);
      const doGrupo = rows.filter((r) => r.grupo === g);
      // naturezas sem subgrupo primeiro
      for (const n of doGrupo.filter((r) => !r.subgrupoId)) cb.natureza(n);
      // depois cada subgrupo com suas naturezas
      for (const sub of subgrupos.filter((s) => s.grupo === g)) {
        cb.subgrupo(sub.nome);
        for (const n of doGrupo.filter((r) => r.subgrupoId === sub.id)) cb.natureza(n);
      }
    }
  }

  async function copiarEstrutura() {
    const linhas: string[] = ["NATUREZAS FINANCEIRAS", ""];
    const natLinha = (n: Natureza, indent: string) => {
      const extras = [tipoLabel(n.tipo)];
      if (n.cif) extras.push("CIF");
      if (n.contaContabil) extras.push(`Conta ${contaTxt(n.contaContabil)}`);
      if (n.contaContrapartida) extras.push(`Contrapartida ${contaTxt(n.contaContrapartida)}`);
      if (!n.ativo) extras.push("inativa");
      linhas.push(`${indent}• ${n.nome} — ${extras.join(" · ")}`);
    };
    let emSubgrupo = false;
    percorrerEstrutura({
      grupo: (label) => { emSubgrupo = false; linhas.push(label); },
      subgrupo: (nome) => { emSubgrupo = true; linhas.push(`  Subgrupo: ${nome}`); },
      natureza: (n) => natLinha(n, emSubgrupo ? "    " : "  "),
    });
    try {
      await navigator.clipboard.writeText(linhas.join("\n"));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch { /* clipboard indisponível */ }
  }

  async function baixarPdf() {
    const head = ["Natureza", "Tipo", "CIF", "Conta contábil", "Contrapartida"];
    const linhasPdf: LinhaPdf[] = [];
    percorrerEstrutura({
      grupo: (label) => linhasPdf.push({ celulas: [label, "", "", "", ""], estilo: "secao" }),
      subgrupo: (nome) => linhasPdf.push({ celulas: [`  ${nome}`, "", "", "", ""], estilo: "secao" }),
      natureza: (n) => linhasPdf.push({
        celulas: [
          n.ativo ? n.nome : `${n.nome} (inativa)`,
          tipoLabel(n.tipo),
          n.cif ? "Sim" : "",
          contaTxt(n.contaContabil),
          contaTxt(n.contaContrapartida),
        ],
        estilo: "normal",
      }),
    });
    await gerarPdfContabil({
      titulo: "Naturezas Financeiras",
      head,
      linhas: linhasPdf,
      alinharDireitaDe: head.length, // nenhuma coluna numérica
      arquivo: `naturezas-financeiras-${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  }

  return (
    <div>
      <PageHeader
        title="Naturezas Financeiras"
        breadcrumbs={[{ label: "Financeiro" }, { label: "Cadastros" }, { label: "Naturezas Financeiras" }]}
        action={
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button size="sm" variant="outline" disabled={loading || semConteudo} />}>
                {copiado ? <Check className="w-4 h-4 mr-1.5 text-success" /> : <Download className="w-4 h-4 mr-1.5" />}
                {copiado ? "Estrutura copiada" : "Baixar / Copiar"}
                <ChevronDown className="w-3.5 h-3.5 ml-1" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={copiarEstrutura}>
                  <Copy className="w-4 h-4 mr-2" /> Copiar estrutura
                </DropdownMenuItem>
                <DropdownMenuItem onClick={baixarPdf}>
                  <FileText className="w-4 h-4 mr-2" /> Baixar PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button size="sm" />}>
                <Plus className="w-4 h-4 mr-1.5" /> Adicionar <ChevronDown className="w-3.5 h-3.5 ml-1" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setNatModal("new")}>
                  <Tag className="w-4 h-4 mr-2" /> Nova natureza
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSubModal("new")}>
                  <FolderClosed className="w-4 h-4 mr-2" /> Novo subgrupo
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />
      <div className="px-8 pb-8 space-y-5">
        <div className="flex items-start gap-3 bg-info/10 border border-info/20 rounded-xl p-4 text-sm text-info max-w-3xl">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            A natureza classifica os títulos por <b>tipo</b> (entrada/saída) e <b>grupo</b> do fluxo de caixa. É escolhida no Pedido de Venda e no Documento de Entrada e diferente do plano de contas.
          </p>
        </div>

        {/* Reorganização única das naturezas da CMB (plano Nibo) — o banner só
            aparece enquanto as naturezas antigas existirem; some após aplicar. */}
        {rows.some((n) => NATUREZAS_ANTIGAS_CMB.has(n.nome)) && (
          <ReorganizacaoCMBBanner onAplicado={load} />
        )}

        {/* Resumo */}
        <div className="flex items-center gap-4">
          <div className="rounded-xl px-5 py-3 bg-info/10 text-info flex items-center gap-3">
            <Tag className="w-5 h-5 opacity-60" />
            <div>
              <p className="text-xs font-medium opacity-70">Total</p>
              <p className="text-2xl font-bold leading-none mt-0.5">{totalNat}</p>
            </div>
          </div>
          <div className="rounded-xl px-5 py-3 bg-success/10 text-success flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <div>
              <p className="text-xs font-medium opacity-70">Ativas</p>
              <p className="text-2xl font-bold leading-none mt-0.5">{ativas}</p>
            </div>
          </div>
          {inativas > 0 && (
            <div className="rounded-xl px-5 py-3 bg-muted text-muted-foreground flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-gray-400" />
              <div>
                <p className="text-xs font-medium opacity-70">Inativas</p>
                <p className="text-2xl font-bold leading-none mt-0.5">{inativas}</p>
              </div>
            </div>
          )}
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar natureza..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          <select
            value={filtroGrupo}
            onChange={(e) => setFiltroGrupo(e.target.value as "" | Grupo)}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-1 focus:ring-blue-400 text-foreground"
          >
            <option value="">Todos os grupos</option>
            {GRUPOS.map((g) => <option key={g} value={g}>{GRUPO_LABEL[g]}</option>)}
          </select>

          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value as "" | Tipo)}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-1 focus:ring-blue-400 text-foreground"
          >
            <option value="">Todos os tipos</option>
            <option value="ENTRADA">Entradas</option>
            <option value="SAIDA">Saídas</option>
          </select>

          <select
            value={filtroAtivo}
            onChange={(e) => setFiltroAtivo(e.target.value as "" | "true" | "false")}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-1 focus:ring-blue-400 text-foreground"
          >
            <option value="">Todos</option>
            <option value="true">Ativas</option>
            <option value="false">Inativas</option>
          </select>

          {temFiltro && (
            <button
              type="button"
              onClick={limparFiltros}
              className="text-xs font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md border border-border hover:bg-muted"
            >
              Limpar
            </button>
          )}
        </div>

        {/* Árvore: Grupo → Subgrupo → Natureza */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : semConteudo ? (
          <div className="py-16 text-center text-muted-foreground text-sm">Nenhuma natureza cadastrada.</div>
        ) : arvore.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">Nenhuma natureza para o filtro.</div>
        ) : (
          <>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={recolherTudo} className="text-xs font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md border border-border hover:bg-muted">
                Recolher tudo
              </button>
              <button type="button" onClick={expandirTudo} className="text-xs font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md border border-border hover:bg-muted">
                Expandir tudo
              </button>
            </div>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-2.5 border-b border-border bg-muted text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <span>Natureza</span>
                <span className="text-center w-24">Status</span>
                <span className="w-16 text-right">Ações</span>
              </div>
              <ul>
                {arvore.map((sec) => {
                  const grupoRecolhido = collapsed.has(sec.grupo);
                  return (
                    <li key={sec.grupo}>
                      {/* Cabeçalho do grupo */}
                      <button
                        type="button"
                        onClick={() => toggle(sec.grupo)}
                        className="w-full grid grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-2 border-b border-gray-50 hover:bg-muted/60 text-sm text-left"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {grupoRecolhido ? <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                          <span className="font-semibold text-foreground truncate">{GRUPO_LABEL[sec.grupo]}</span>
                          <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-muted text-muted-foreground text-[11px] font-medium shrink-0 tabular-nums" title={`${sec.total} natureza(s)`}>
                            {sec.total}
                          </span>
                        </div>
                        <span className="w-24" />
                        <span className="w-16" />
                      </button>

                      {!grupoRecolhido && (
                        <>
                          {/* Subgrupos do grupo */}
                          {sec.subs.map(({ sub, naturezas }) => {
                            const subRecolhido = collapsed.has(`sub:${sub.id}`);
                            return (
                              <div key={sub.id}>
                                <div className="group/row grid grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-2 border-b border-gray-50 hover:bg-muted/60 text-sm">
                                  <button
                                    type="button"
                                    onClick={() => toggle(`sub:${sub.id}`)}
                                    className="flex items-center gap-2 min-w-0 text-left"
                                    style={{ paddingLeft: "18px" }}
                                  >
                                    {subRecolhido ? <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                                    <FolderClosed className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                                    <span className="font-medium text-foreground truncate">{sub.nome}</span>
                                    <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-muted text-muted-foreground text-[11px] font-medium shrink-0 tabular-nums" title={`${naturezas.length} natureza(s)`}>
                                      {naturezas.length}
                                    </span>
                                  </button>
                                  <span className="w-24" />
                                  <div className="w-16 flex items-center justify-end gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => setSubModal(sub)}
                                      className="p-1.5 rounded-lg text-muted-foreground hover:text-info hover:bg-info/10 transition-colors"
                                      title="Editar subgrupo"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => excluirSubgrupo(sub)}
                                      className="p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors"
                                      title="Excluir subgrupo"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                                {!subRecolhido && naturezas.map((n) => (
                                  <NaturezaLinha key={n.id} n={n} nivel={2} onEdit={setNatModal} onDelete={excluirNatureza} />
                                ))}
                              </div>
                            );
                          })}

                          {/* Naturezas sem subgrupo */}
                          {sec.semSubgrupo.map((n) => (
                            <NaturezaLinha key={n.id} n={n} nivel={1} onEdit={setNatModal} onDelete={excluirNatureza} />
                          ))}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}
      </div>

      {natModal && (
        <NaturezaDialog
          editing={natModal === "new" ? null : natModal}
          subgrupos={subgrupos}
          contasResultado={contasResultado}
          contasPatrimoniais={contasPatrimoniais}
          onClose={() => setNatModal(null)}
          onSaved={() => { setNatModal(null); load(); }}
        />
      )}
      {subModal && (
        <SubgrupoDialog
          editing={subModal === "new" ? null : subModal}
          onClose={() => setSubModal(null)}
          onSaved={() => { setSubModal(null); load(); }}
        />
      )}
    </div>
  );
}

function NaturezaLinha({ n, nivel, onEdit, onDelete }: {
  n: Natureza; nivel: 1 | 2; onEdit: (n: Natureza) => void; onDelete: (n: Natureza) => void;
}) {
  const entrada = n.tipo === "ENTRADA";
  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-2 border-b border-gray-50 hover:bg-muted/60 text-sm group/row",
        !n.ativo && "opacity-50",
      )}
    >
      <div className="flex items-center gap-2 min-w-0" style={{ paddingLeft: `${nivel * 18}px` }}>
        <CornerDownRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
        {entrada
          ? <ArrowUpRight className="w-4 h-4 text-emerald-500 shrink-0" />
          : <ArrowDownLeft className="w-4 h-4 text-rose-500 shrink-0" />}
        <span className="truncate text-foreground">{n.nome}</span>
        {n.sistema && (
          <Lock
            className="w-3 h-3 text-muted-foreground/70 shrink-0"
            aria-label="Natureza padrão do sistema — não pode ser editada nem excluída"
          />
        )}
        {n.cif && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground shrink-0">CIF</span>
        )}
        {n.contaContabil && (
          <span className="font-mono text-[11px] text-muted-foreground shrink-0">{n.contaContabil.codigo}</span>
        )}
      </div>
      <span className="w-24 text-center">
        <span className={cn(
          "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
          n.ativo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
        )}>
          {n.ativo ? "Ativa" : "Inativa"}
        </span>
      </span>
      {n.sistema ? (
        // Natureza padrão do sistema: sem editar/excluir — só o cadeado (estilo Nibo).
        <div className="w-16 flex items-center justify-end pr-1.5">
          <Lock className="w-3.5 h-3.5 text-muted-foreground/50" aria-label="Natureza padrão do sistema" />
        </div>
      ) : (
        <div className="w-16 flex items-center justify-end gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(n)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-info hover:bg-info/10 transition-colors"
            title="Editar"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(n)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors"
            title="Excluir"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function NaturezaDialog({ editing, subgrupos, contasResultado, contasPatrimoniais, onClose, onSaved }: {
  editing: Natureza | null;
  subgrupos: Subgrupo[];
  contasResultado: ContaResultado[];
  contasPatrimoniais: ContaPatrimonial[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [tipo, setTipo] = useState<Tipo>(editing?.tipo ?? "SAIDA");
  const [grupo, setGrupo] = useState<Grupo>(editing?.grupo ?? "DESPESA_OPERACIONAL");
  const [subgrupoId, setSubgrupoId] = useState(editing?.subgrupoId ?? "");
  const [contaContabilId, setContaContabilId] = useState(editing?.contaContabilId ?? "");
  const [contaContrapartidaId, setContaContrapartidaId] = useState(editing?.contaContrapartidaId ?? "");
  const [cif, setCif] = useState(editing?.cif ?? false);
  const [destinoSugerido, setDestinoSugerido] = useState(editing?.destinoSugerido ?? "");
  const [aplicavelRequisicao, setAplicavelRequisicao] = useState(editing?.aplicavelRequisicao ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subsDoGrupo = subgrupos.filter((s) => s.grupo === grupo);

  async function salvar() {
    if (!nome.trim()) { setError("Informe o nome."); return; }
    // CIF não usa conta de resultado nem contrapartida: o débito vai para
    // "CIF a Apropriar" (1.1.4.0001) e o crédito é fornecedor/estoque.
    if (!cif) {
      if (!contaContabilId) { setError("Selecione a conta de resultado."); return; }
      if (!contaContrapartidaId) { setError(tipo === "ENTRADA" ? "Selecione a conta a receber (contrapartida)." : "Selecione a conta a pagar (contrapartida)."); return; }
    }
    setSaving(true); setError(null);
    const url = editing ? `/api/financeiro/naturezas/${editing.id}` : "/api/financeiro/naturezas";
    const res = await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: nome.trim(), tipo, grupo, cif, destinoSugerido: destinoSugerido || null, aplicavelRequisicao, subgrupoId: subgrupoId || null, contaContabilId: cif ? null : (contaContabilId || null), contaContrapartidaId: cif ? null : (contaContrapartidaId || null) }),
    });
    if (!res.ok) { setError((await res.json()).error ?? "Erro ao salvar"); setSaving(false); return; }
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Editar natureza" : "Nova natureza"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="flex items-center gap-6">
            <TipoRadio label="Entrada" icon={<ArrowUpRight className="w-3.5 h-3.5" />} active={tipo === "ENTRADA"} onClick={() => setTipo("ENTRADA")} cor="emerald" />
            <TipoRadio label="Saída" icon={<ArrowDownLeft className="w-3.5 h-3.5" />} active={tipo === "SAIDA"} onClick={() => setTipo("SAIDA")} cor="rose" />
          </div>
          <div className="space-y-1.5">
            <Label>Nome da natureza *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Venda de mercadorias, Aluguel..." autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") salvar(); }} />
          </div>
          <div className="space-y-1.5">
            <Label>Grupo *</Label>
            <select value={grupo} onChange={(e) => { setGrupo(e.target.value as Grupo); setSubgrupoId(""); }} className="w-full h-10 rounded-lg border border-border px-3 text-sm bg-card">
              {GRUPOS.map((g) => <option key={g} value={g}>{GRUPO_LABEL[g]}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Subgrupo (opcional)</Label>
            <ComboboxWithCreate
              value={subgrupoId}
              onChange={(v) => setSubgrupoId(v)}
              noneLabel="— Sem subgrupo —"
              triggerClassName="h-10 rounded-lg"
              options={subsDoGrupo.map((s) => ({ value: s.id, label: s.nome }))}
            />
          </div>
          <label className="flex items-start gap-2 rounded-lg border border-border p-2.5 cursor-pointer">
            <input type="checkbox" checked={cif} onChange={(e) => setCif(e.target.checked)} className="mt-0.5" />
            <span className="text-sm text-foreground">
              Custo Indireto de Fabricação (CIF)
              <span className="block text-[11px] text-muted-foreground">O débito vai para “CIF a Apropriar” (1.1.4.0001) e o crédito é fornecedor/estoque — sem conta de resultado nem contrapartida.</span>
            </span>
          </label>
          {tipo === "SAIDA" && (
            <label className="flex items-start gap-2 rounded-lg border border-border p-2.5 cursor-pointer">
              <input type="checkbox" checked={aplicavelRequisicao} onChange={(e) => setAplicavelRequisicao(e.target.checked)} className="mt-0.5" />
              <span className="text-sm text-foreground">
                Aplicável a requisição de material
                <span className="block text-[11px] text-muted-foreground">Aparece no seletor da RM (consumo de estoque). Deixe desmarcado para naturezas de tesouraria, compra a fornecedor ou investimento.</span>
              </span>
            </label>
          )}
          <div className="space-y-1.5">
            <Label>Destino sugerido (requisição) <span className="text-muted-foreground font-normal text-xs">(opcional — só alerta de coerência)</span></Label>
            <select value={destinoSugerido} onChange={(e) => setDestinoSugerido(e.target.value)} className="w-full h-10 rounded-lg border border-border px-3 text-sm bg-card">
              <option value="">— Nenhum —</option>
              <option value="PEP_MD">PEP-MD (material direto)</option>
              <option value="CIF">CIF (indireto fabril)</option>
              <option value="IMOBILIZADO">Imobilizado</option>
              <option value="DESPESA">Despesa</option>
            </select>
            <p className="text-[11px] text-muted-foreground">Não roteia nada — serve só para avisar na requisição quando a natureza não combina com o destino real (flags do item + centro).</p>
          </div>
          {!cif && (<>
          <div className="space-y-1.5">
            <Label>Conta de resultado (contábil) *</Label>
            <ComboboxWithCreate
              value={contaContabilId}
              onChange={(v) => setContaContabilId(v)}
              allowNone={false}
              triggerClassName="h-10 rounded-lg"
              options={contasResultado.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nome}` }))}
            />
            <p className="text-[11px] text-muted-foreground">Conta de receita/despesa do plano de contas (creditada/debitada na competência).</p>
          </div>
          <div className="space-y-1.5">
            <Label>{tipo === "ENTRADA" ? "Conta a receber (contrapartida ativa) *" : "Conta a pagar (contrapartida passiva) *"}</Label>
            <ComboboxWithCreate
              value={contaContrapartidaId}
              onChange={(v) => setContaContrapartidaId(v)}
              allowNone={false}
              triggerClassName="h-10 rounded-lg"
              options={contasPatrimoniais
                .filter((c) => (tipo === "ENTRADA" ? c.grupo === "ATIVO" : c.grupo === "PASSIVO"))
                .map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nome}${c.porBeneficiario ? " (por beneficiário)" : ""}` }))}
            />
            <p className="text-[11px] text-muted-foreground">
              {tipo === "ENTRADA"
                ? "Para Clientes a Receber, selecione a conta sintética “(por beneficiário)” — a analítica de cada cliente é resolvida automaticamente no lançamento. Use uma analítica direta (ex.: Outros a Receber) só para receitas sem cliente."
                : "Para Fornecedores ou Salários a Pagar, selecione a conta sintética “(por beneficiário)” — a analítica de cada fornecedor/colaborador é resolvida automaticamente no lançamento. Use uma analítica direta (ex.: INSS/FGTS a Recolher) só para encargos sem beneficiário."}
            </p>
          </div>
          </>)}
          {error && <p className="text-sm text-rose-500">{error}</p>}
          {editing && <Autoria criadoPor={editing.criadoPor} atualizadoPor={editing.atualizadoPor} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving || !nome.trim()}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubgrupoDialog({ editing, onClose, onSaved }: {
  editing: Subgrupo | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [grupo, setGrupo] = useState<Grupo>(editing?.grupo ?? "DESPESA_OPERACIONAL");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function salvar() {
    if (!nome.trim()) { setError("Informe o nome."); return; }
    setSaving(true); setError(null);
    const url = editing ? `/api/financeiro/naturezas/subgrupos/${editing.id}` : "/api/financeiro/naturezas/subgrupos";
    const res = await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: nome.trim(), grupo }),
    });
    if (!res.ok) { setError((await res.json()).error ?? "Erro ao salvar"); setSaving(false); return; }
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Editar subgrupo" : "Novo subgrupo"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Nome do subgrupo *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Deduções sobre receita" autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") salvar(); }} />
          </div>
          <div className="space-y-1.5">
            <Label>Grupo *</Label>
            <select value={grupo} onChange={(e) => setGrupo(e.target.value as Grupo)} className="w-full h-10 rounded-lg border border-border px-3 text-sm bg-card">
              {GRUPOS.map((g) => <option key={g} value={g}>{GRUPO_LABEL[g]}</option>)}
            </select>
          </div>
          {error && <p className="text-sm text-rose-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving || !nome.trim()}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TipoRadio({ label, icon, active, onClick, cor }: {
  label: string; icon: React.ReactNode; active: boolean; onClick: () => void; cor: "emerald" | "rose";
}) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-2 text-sm">
      <span className={cn("w-4 h-4 rounded-full border flex items-center justify-center",
        active ? (cor === "emerald" ? "border-emerald-500" : "border-rose-500") : "border-border")}>
        {active && <span className={cn("w-2 h-2 rounded-full", cor === "emerald" ? "bg-emerald-500" : "bg-rose-500")} />}
      </span>
      <span className={cn("inline-flex items-center gap-1", active ? "text-foreground font-medium" : "text-muted-foreground")}>
        {icon}{label}
      </span>
    </button>
  );
}

// ── Reorganização única das naturezas da CMB (plano Nibo, 15/07/2026) ─────────
// Nomes antigos que denunciam a pendência — o banner some quando não existem mais.
const NATUREZAS_ANTIGAS_CMB = new Set([
  "DESPESA ADMIN", "DESPESA PESSOAL ADMIN", "CAIXA ELLYELTON",
  "CAMINHAO MUNCK JUQ3G04", "SAUDE E SEGURANCA NO TRABALHO",
  "Energia, água e telefone", "Insumos / matéria-prima",
]);

type ReorgResultado = {
  dry: boolean;
  renomeadas: string[];
  criadas: string[];
  merges: { de: string; para: string; titulosCR: number; titulosCP: number; lancamentos: number }[];
  recontabilizados: number;
  errosRecontabilizacao: string[];
  avisos: string[];
};

function ReorganizacaoCMBBanner({ onAplicado }: { onAplicado: () => void }) {
  const [previa, setPrevia] = useState<ReorgResultado | null>(null);
  const [rodando, setRodando] = useState<"previa" | "aplicar" | null>(null);
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState<ReorgResultado | null>(null);

  async function rodar(dry: boolean) {
    setRodando(dry ? "previa" : "aplicar"); setErro("");
    try {
      const res = await fetch("/api/financeiro/naturezas/reorganizar-cmb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry }),
      });
      const j = await res.json();
      if (!res.ok) { setErro(j.error ?? "Erro ao executar."); return; }
      if (dry) setPrevia(j.data as ReorgResultado);
      else { setFeito(j.data as ReorgResultado); setPrevia(null); onAplicado(); }
    } catch { setErro("Erro de conexão."); }
    finally { setRodando(null); }
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-warning/10 p-4 space-y-3 text-sm">
      <p className="font-semibold text-foreground">Padronização das naturezas (plano Nibo) pendente</p>
      <p className="text-muted-foreground">
        Renomeia para o padrão, cria as naturezas que faltam (retenções com cadeado) e relança os títulos das
        naturezas fora do padrão (COMBUSTIVEL duplicado, DESPESA ADMIN, CAIXA ELLYELTON, caminhão etc.),
        recontabilizando cada título. Faz backup antes. Veja a prévia primeiro.
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => rodar(true)} disabled={rodando !== null}>
          {rodando === "previa" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null} Ver prévia
        </Button>
        {previa && (
          <Button size="sm" onClick={() => rodar(false)} disabled={rodando !== null}>
            {rodando === "aplicar" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null} Aplicar agora
          </Button>
        )}
      </div>
      {erro && <p className="text-danger">{erro}</p>}
      {previa && (
        <div className="rounded-lg bg-card border border-border p-3 space-y-1.5 text-xs">
          <p className="font-semibold">Prévia (nada foi alterado):</p>
          <p>Renomeios: {previa.renomeadas.length ? previa.renomeadas.join("; ") : "nenhum pendente"}</p>
          <p>Criações: {previa.criadas.length ? `${previa.criadas.length} naturezas (${previa.criadas.slice(0, 6).join(", ")}${previa.criadas.length > 6 ? "…" : ""})` : "nenhuma pendente"}</p>
          {previa.merges.map((m) => (
            <p key={m.de}>Relançar <b>{m.de}</b> → <b>{m.para}</b>: {m.titulosCR + m.titulosCP} título(s), {m.lancamentos} lançamento(s) de caixa</p>
          ))}
          {previa.avisos.map((a, i) => <p key={i} className="text-warning">{a}</p>)}
        </div>
      )}
      {feito && (
        <div className="rounded-lg bg-success/10 border border-success/30 p-3 text-xs text-success space-y-1">
          <p className="font-semibold">Aplicado.</p>
          <p>{feito.renomeadas.length} renomeada(s), {feito.criadas.length} criada(s), {feito.merges.length} merge(s), {feito.recontabilizados} título(s) recontabilizado(s).</p>
          {feito.errosRecontabilizacao.length > 0 && (
            <p className="text-danger">Erros de recontabilização: {feito.errosRecontabilizacao.join("; ")}</p>
          )}
          {feito.avisos.map((a, i) => <p key={i} className="text-warning">{a}</p>)}
        </div>
      )}
    </div>
  );
}
