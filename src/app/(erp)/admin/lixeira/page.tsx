"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useTabTitle } from "@/lib/tabs-context";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import {
  Trash2, Search, ChevronLeft, ChevronRight, RotateCcw, Loader2,
  ShieldAlert, CheckCircle2, AlertTriangle,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type LixeiraItem = {
  id: string;
  empresaId: string;
  tipo: string;
  origemId: string;
  numero: string | null;
  descricao: string | null;
  apagadoPor: string | null;
  createdAt: string;
  restauradoEm: string | null;
  restauradoComoId: string | null;
};

type SnapshotItem = Record<string, unknown> & {
  itemId?: string;
  quantidade?: unknown;
  descricao?: string | null;
  item?: { descricao?: string | null } | null;
};

type LixeiraDetalhe = LixeiraItem & {
  snapshot: (Record<string, unknown> & { itens?: SnapshotItem[] }) | null;
};

const TIPO_LABEL: Record<string, string> = {
  PEDIDO_VENDA: "Pedido de venda",
  MINUTA: "Minuta (entrega)",
  PEDIDO_COMPRA: "Pedido de compra",
  COTACAO_COMPRA: "Cotação de compras",
  CONFERENCIA_COMPRA: "Conferência (doc. entrada)",
  ORDEM_PRODUCAO: "Ordem de produção",
  CONTA_BANCARIA: "Conta bancária",
};

const TIPOS = Object.keys(TIPO_LABEL);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** empresaId curto p/ badge: "emp_tramontin" → "tramontin". */
function empresaCurta(empresaId: string) {
  return empresaId.replace(/^emp[_-]/, "");
}

function tipoLabel(tipo: string) {
  return TIPO_LABEL[tipo] ?? tipo;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/;

/** Rótulos humanos p/ as chaves mais comuns dos snapshots. */
const CAMPO_LABEL: Record<string, string> = {
  numero: "Número",
  numeroFisico: "Número físico",
  status: "Status original",
  tipo: "Tipo",
  dataEmissao: "Data de emissão",
  dataEntrega: "Data de entrega",
  dataConclusao: "Data de conclusão",
  dataVencimento: "Vencimento",
  dataPedido: "Data do pedido",
  observacoes: "Observações",
  placa: "Placa",
  valorTotal: "Valor total",
  descricao: "Descrição",
  nome: "Nome",
  banco: "Banco",
  agencia: "Agência",
  conta: "Conta",
};

/** Campos legíveis do snapshot: escalares, sem ids técnicos, datas formatadas. */
function camposLegiveis(snapshot: Record<string, unknown>): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(snapshot)) {
    if (v === null || v === undefined || v === "") continue;
    if (k === "id" || k.endsWith("Id") || k === "itens") continue;
    if (typeof v === "object") continue;
    let valor: string;
    if (typeof v === "boolean") valor = v ? "Sim" : "Não";
    else if (typeof v === "string" && ISO_DATE_RE.test(v)) {
      valor = v.includes("T") && !v.startsWith(v.slice(0, 10) + "T00:00")
        ? formatDateTime(v)
        : formatDate(v);
    } else valor = String(v);
    out.push([CAMPO_LABEL[k] ?? k, valor]);
  }
  // Campos conhecidos primeiro, na ordem do CAMPO_LABEL; o resto depois.
  const ordem = Object.values(CAMPO_LABEL);
  return out.sort((a, b) => {
    const ia = ordem.indexOf(a[0]); const ib = ordem.indexOf(b[0]);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}

function descricaoDoItem(si: SnapshotItem): string {
  if (si.item?.descricao) return si.item.descricao;
  if (typeof si.descricao === "string" && si.descricao) return si.descricao;
  return si.itemId ? String(si.itemId) : "—";
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LixeiraPage() {
  useTabTitle("Lixeira");

  // Filtros / lista
  const [tipo, setTipo] = useState("");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [itens, setItens] = useState<LixeiraItem[]>([]);
  const [total, setTotal] = useState(0);
  const [tamanhoPagina, setTamanhoPagina] = useState(50);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  // Detalhe (drawer)
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<LixeiraDetalhe | null>(null);
  const [detalheLoading, setDetalheLoading] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [restauroErro, setRestauroErro] = useState("");
  const [restauroAvisos, setRestauroAvisos] = useState<string[]>([]);

  // Debounce da busca
  useEffect(() => {
    const t = setTimeout(() => { setQDebounced(q); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tipo) params.set("tipo", tipo);
      if (qDebounced) params.set("q", qDebounced);
      params.set("page", String(page));
      const res = await fetch(`/api/admin/lixeira?${params}`);
      if (res.status === 403) { setForbidden(true); setItens([]); setTotal(0); return; }
      const d = await res.json();
      setForbidden(false);
      setItens(Array.isArray(d.data) ? d.data : []);
      setTotal(d.total ?? 0);
      setTamanhoPagina(d.tamanhoPagina ?? 50);
    } catch {
      setItens([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [tipo, qDebounced, page]);

  useEffect(() => { load(); }, [load]);

  // Carrega o detalhe ao abrir o drawer
  useEffect(() => {
    if (!detalheId) { setDetalhe(null); return; }
    setDetalheLoading(true);
    setRestauroErro("");
    setRestauroAvisos([]);
    fetch(`/api/admin/lixeira/${detalheId}`)
      .then((r) => r.json())
      .then((d) => setDetalhe(d.data ?? null))
      .catch(() => setDetalhe(null))
      .finally(() => setDetalheLoading(false));
  }, [detalheId]);

  async function handleRestaurar() {
    if (!detalhe) return;
    const ok = window.confirm(
      "Restaurar este documento? O estoque será baixado novamente e a contabilidade refeita; custos são revalorados ao custo atual."
    );
    if (!ok) return;
    setRestaurando(true);
    setRestauroErro("");
    setRestauroAvisos([]);
    try {
      const res = await fetch(`/api/admin/lixeira/${detalhe.id}/restaurar`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) {
        setRestauroErro(d.error ?? "Erro ao restaurar.");
        return;
      }
      setRestauroAvisos([
        `Documento restaurado como ${d.data?.numero ?? "—"}.`,
        ...(d.data?.avisos ?? []),
      ]);
      // Recarrega lista e detalhe (agora com restauradoEm preenchido)
      await load();
      const det = await fetch(`/api/admin/lixeira/${detalhe.id}`).then((r) => r.json()).catch(() => null);
      if (det?.data) setDetalhe(det.data);
    } catch {
      setRestauroErro("Erro de rede ao restaurar.");
    } finally {
      setRestaurando(false);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / tamanhoPagina));
  const snapshot = detalhe?.snapshot ?? null;
  const snapshotItens = Array.isArray(snapshot?.itens) ? snapshot.itens : [];
  const podeRestaurar = !!detalhe && detalhe.tipo === "MINUTA" && !detalhe.restauradoEm;

  return (
    <div>
      <PageHeader
        title="Lixeira"
        breadcrumbs={[{ label: "Administração" }, { label: "Lixeira" }]}
      />

      <div className="px-8 pb-8 space-y-4 max-w-6xl">
        {forbidden ? (
          <div className="flex items-center gap-3 bg-danger/10 text-danger rounded-xl px-4 py-3 text-sm">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            Apenas administradores podem acessar a lixeira.
          </div>
        ) : (
          <>
            {/* ── Filtros ─────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={tipo}
                onChange={(e) => { setTipo(e.target.value); setPage(1); }}
                className="px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todos os tipos</option>
                {TIPOS.map((t) => (
                  <option key={t} value={t}>{TIPO_LABEL[t]}</option>
                ))}
              </select>

              <div className="relative max-w-sm flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar por número ou descrição..."
                  className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <span className="text-xs text-muted-foreground ml-auto">
                {total} {total === 1 ? "registro" : "registros"}
              </span>
            </div>

            {/* ── Tabela ──────────────────────────────────────────────── */}
            <div className="rounded-xl border border-border overflow-hidden bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b text-xs text-muted-foreground uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Data</th>
                    <th className="text-left px-4 py-3 font-medium">Empresa</th>
                    <th className="text-left px-4 py-3 font-medium">Tipo</th>
                    <th className="text-left px-4 py-3 font-medium">Número</th>
                    <th className="text-left px-4 py-3 font-medium">Descrição</th>
                    <th className="text-left px-4 py-3 font-medium">Apagado por</th>
                    <th className="text-left px-4 py-3 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">Carregando...</td></tr>
                  ) : itens.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                        <Trash2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                        Nenhum documento na lixeira
                      </td>
                    </tr>
                  ) : itens.map((it) => (
                    <tr
                      key={it.id}
                      className="hover:bg-muted cursor-pointer"
                      onClick={() => setDetalheId(it.id)}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatDateTime(it.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                          {empresaCurta(it.empresaId)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{tipoLabel(it.tipo)}</td>
                      <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{it.numero ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[280px]">
                        <span className="truncate block">{it.descricao ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{it.apagadoPor ?? "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {it.restauradoEm ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-success/15 text-success">
                            <CheckCircle2 className="w-3 h-3" /> Restaurado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                            Na lixeira
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Paginação ───────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Os registros ficam na lixeira por 90 dias.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
                </Button>
                <span className="text-xs text-muted-foreground">
                  Página {page} de {totalPaginas}
                </span>
                <Button
                  variant="outline" size="sm"
                  disabled={page >= totalPaginas || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Drawer de detalhe ──────────────────────────────────────────── */}
      <Sheet open={!!detalheId} onOpenChange={(open) => { if (!open) setDetalheId(null); }}>
        <SheetContent className="flex flex-col overflow-hidden">
          <SheetHeader>
            <SheetTitle>
              {detalhe ? `${tipoLabel(detalhe.tipo)} ${detalhe.numero ?? ""}`.trim() : "Documento apagado"}
            </SheetTitle>
            <SheetDescription>
              {detalhe
                ? `Apagado em ${formatDateTime(detalhe.createdAt)}${detalhe.apagadoPor ? ` por ${detalhe.apagadoPor}` : ""}`
                : "Detalhes do documento apagado"}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {detalheLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
              </div>
            ) : !detalhe ? (
              <p className="text-sm text-muted-foreground">Registro não encontrado.</p>
            ) : (
              <>
                {/* Situação */}
                {detalhe.restauradoEm && (
                  <div className="flex items-center gap-2 bg-success/10 text-success rounded-lg px-3 py-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Restaurado em {formatDateTime(detalhe.restauradoEm)}
                  </div>
                )}
                {restauroAvisos.length > 0 && (
                  <div className="bg-success/10 text-success rounded-lg px-3 py-2 text-sm space-y-1">
                    {restauroAvisos.map((a, i) => <p key={i}>{a}</p>)}
                  </div>
                )}
                {restauroErro && (
                  <div className="flex items-start gap-2 bg-danger/10 text-danger rounded-lg px-3 py-2 text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    {restauroErro}
                  </div>
                )}

                {/* Identificação */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Empresa</p>
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground mt-0.5">
                      {empresaCurta(detalhe.empresaId)}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tipo</p>
                    <p className="text-foreground">{tipoLabel(detalhe.tipo)}</p>
                  </div>
                  {detalhe.descricao && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Descrição</p>
                      <p className="text-foreground">{detalhe.descricao}</p>
                    </div>
                  )}
                </div>

                {/* Campos do snapshot */}
                {snapshot ? (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Dados do documento
                    </h4>
                    <div className="rounded-lg border border-border divide-y divide-border">
                      {camposLegiveis(snapshot).map(([label, valor]) => (
                        <div key={label} className="flex items-start justify-between gap-4 px-3 py-2 text-sm">
                          <span className="text-muted-foreground shrink-0">{label}</span>
                          <span className="text-foreground text-right break-words min-w-0">{valor}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Sem snapshot disponível.</p>
                )}

                {/* Itens */}
                {snapshotItens.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Itens ({snapshotItens.length})
                    </h4>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted text-xs text-muted-foreground uppercase tracking-wide">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium">Item</th>
                            <th className="text-right px-3 py-2 font-medium">Quantidade</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {snapshotItens.map((si, i) => (
                            <tr key={i}>
                              <td className="px-3 py-2 text-foreground">{descricaoDoItem(si)}</td>
                              <td className="px-3 py-2 text-right text-foreground">
                                {si.quantidade !== undefined && si.quantidade !== null ? String(si.quantidade) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* JSON bruto */}
                {snapshot && (
                  <details className="rounded-lg border border-border">
                    <summary className="px-3 py-2 text-sm text-muted-foreground cursor-pointer select-none hover:text-foreground">
                      JSON completo do snapshot
                    </summary>
                    <pre className="px-3 pb-3 text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(snapshot, null, 2)}
                    </pre>
                  </details>
                )}
              </>
            )}
          </div>

          {/* Rodapé com ação */}
          {detalhe && !detalheLoading && (
            <div className="border-t border-border p-4 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Os registros ficam na lixeira por 90 dias.
              </p>
              <Button
                size="sm"
                onClick={handleRestaurar}
                disabled={!podeRestaurar || restaurando}
                title={
                  detalhe.restauradoEm
                    ? "Este documento já foi restaurado"
                    : detalhe.tipo !== "MINUTA"
                    ? "Restauração automática ainda não disponível para este tipo — use os dados do snapshot"
                    : undefined
                }
                className={cn(!podeRestaurar && "opacity-50")}
              >
                {restaurando
                  ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Restaurando...</>
                  : <><RotateCcw className="w-4 h-4 mr-1.5" /> Restaurar</>}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
