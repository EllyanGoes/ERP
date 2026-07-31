"use client";
// Pagamento de Diárias — módulo próprio: o diarista acumula diárias de várias
// folhas FECHADAS e recebe o TOTAL de uma vez. A tela agrupa as pendências por
// pessoa (expande para ver os dias); pagar baixa o título único de cada folha
// envolvida e posta o contábil por pessoa (D 2.1.6.x / C banco) no servidor.
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import DatePicker from "@/components/shared/DatePicker";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { formatBRL, cn } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";
import { Loader2, ChevronRight, ChevronDown, AlertCircle, Banknote, CheckCircle2, Search } from "lucide-react";

type Diaria = { id: string; data: string; turno: string; setor: string | null; servico: string | null; valor: number; folhaId: string };
type Pessoa = { colaboradorId: string; nome: string; total: number; diarias: Diaria[] };
type ContaBancaria = { id: string; nome: string; ativo?: boolean; compensacao?: boolean };

const fmtData = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");

export default function PagamentoDiariasPage() {
  useTabTitle("Pagamento de Diárias");
  const hoje = new Date().toLocaleDateString("sv-SE");

  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [loading, setLoading] = useState(true);
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [contaBancariaId, setContaBancariaId] = useState("");
  const [data, setData] = useState(hoje);
  const [sel, setSel] = useState<Set<string>>(new Set()); // colaboradorIds
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [pagando, setPagando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const carregar = useCallback(async () => {
    const r = await fetch("/api/rh/diaristas/pagamentos");
    const j = await r.json().catch(() => ({}));
    setPessoas(Array.isArray(j.data) ? j.data : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    carregar();
    fetch("/api/financeiro/contas")
      .then((r) => r.json())
      .then((j) => setContas((Array.isArray(j) ? j : (j.data ?? [])).filter((c: ContaBancaria) => !c.compensacao && c.ativo !== false)))
      .catch(() => {});
  }, [carregar]);

  const filtradas = useMemo(
    () => pessoas.filter((p) => p.nome.toLowerCase().includes(busca.trim().toLowerCase())),
    [pessoas, busca],
  );
  const selecionadas = filtradas.filter((p) => sel.has(p.colaboradorId));
  const totalSel = selecionadas.reduce((s, p) => s + p.total, 0);
  const totalGeral = filtradas.reduce((s, p) => s + p.total, 0);

  function toggle(id: string) {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function toggleExp(id: string) {
    setExpandidos((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function pagar(alvo: Pessoa[]) {
    if (alvo.length === 0) return;
    if (!contaBancariaId) { setErro("Selecione a conta de saída do pagamento."); return; }
    const itemIds = alvo.flatMap((p) => p.diarias.map((d) => d.id));
    setPagando(true); setErro(""); setAviso("");
    try {
      const r = await fetch("/api/rh/diaristas/pagamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds, dataPagamento: data, contaBancariaId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error || "Falha ao registrar o pagamento."); return; }
      setAviso(`${alvo.length} pessoa(s) paga(s) — ${j.data?.pagos ?? itemIds.length} diária(s), ${formatBRL(j.data?.total ?? 0)}.`);
      setSel(new Set());
      await carregar();
    } finally { setPagando(false); }
  }

  return (
    <div>
      <PageHeader
        title="Pagamento de Diárias"
        breadcrumbs={[{ label: "Gestão de Pessoas" }, { label: "Diárias", href: "/rh/diaristas" }, { label: "Pagamentos" }]}
      />
      <div className="px-8 pb-10 space-y-4">
        {erro && <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm"><AlertCircle className="w-4 h-4" /> {erro}</div>}
        {aviso && <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-success/10 border border-success/30 text-success text-sm"><CheckCircle2 className="w-4 h-4" /> {aviso}</div>}

        {/* Barra de ação: busca + data + conta + pagar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar diarista…"
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {filtradas.length} pessoa(s) · pendente {formatBRL(totalGeral)}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <DatePicker value={data} onChange={(v) => setData(v || hoje)} triggerClassName="h-9" />
            <div className="w-60">
              <ComboboxWithCreate
                value={contaBancariaId}
                onChange={setContaBancariaId}
                noneLabel="Conta de saída…"
                menuMinWidth={340}
                triggerClassName={cn("h-9 rounded-md", !contaBancariaId && "border-warning/50")}
                options={contas.map((c) => ({ value: c.id, label: c.nome }))}
              />
            </div>
            {selecionadas.length > 0 && (
              <Button onClick={() => pagar(selecionadas)} disabled={pagando}>
                {pagando ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Banknote className="w-4 h-4 mr-1.5" />}
                Pagar selecionados ({selecionadas.length} · {formatBRL(totalSel)})
              </Button>
            )}
            <Button variant={selecionadas.length > 0 ? "outline" : "default"} onClick={() => pagar(filtradas)} disabled={pagando || filtradas.length === 0}>
              {pagando && selecionadas.length === 0 ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              Pagar todos ({formatBRL(totalGeral)})
            </Button>
          </div>
        </div>

        {/* Pendências agrupadas por pessoa */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      className="accent-blue-600"
                      checked={filtradas.length > 0 && selecionadas.length === filtradas.length}
                      onChange={(e) => setSel(e.target.checked ? new Set(filtradas.map((p) => p.colaboradorId)) : new Set())}
                    />
                  </th>
                  <th className="w-8 px-2 py-3"></th>
                  <th className="text-left px-3 py-3 font-semibold">Diarista</th>
                  <th className="text-right px-3 py-3 font-semibold w-28">Diárias</th>
                  <th className="text-left px-3 py-3 font-semibold w-56">Período</th>
                  <th className="text-right px-4 py-3 font-semibold w-32">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtradas.map((p) => {
                  const de = p.diarias[0]?.data, ate = p.diarias[p.diarias.length - 1]?.data;
                  return (
                    <Fragment key={p.colaboradorId}>
                      <tr className="hover:bg-muted">
                        <td className="px-4 py-2.5 text-center">
                          <input type="checkbox" className="accent-blue-600" checked={sel.has(p.colaboradorId)} onChange={() => toggle(p.colaboradorId)} />
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <button onClick={() => toggleExp(p.colaboradorId)} className="text-muted-foreground hover:text-foreground" title="Ver as diárias">
                            {expandidos.has(p.colaboradorId) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 font-medium text-foreground">{p.nome}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{p.diarias.length}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {de === ate ? fmtData(de) : `${fmtData(de)} — ${fmtData(ate)}`}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatBRL(p.total)}</td>
                      </tr>
                      {expandidos.has(p.colaboradorId) && (
                        <tr className="bg-muted/40">
                          <td colSpan={6} className="px-12 py-2">
                            <table className="w-full text-xs">
                              <tbody className="divide-y divide-border/60">
                                {p.diarias.map((d) => (
                                  <tr key={d.id}>
                                    <td className="py-1.5 w-28 text-muted-foreground">{fmtData(d.data)}{d.turno === "NOITE" ? " (noite)" : ""}</td>
                                    <td className="py-1.5 text-muted-foreground">{[d.setor, d.servico].filter(Boolean).join(" · ") || "—"}</td>
                                    <td className="py-1.5 w-28 text-right tabular-nums">{formatBRL(d.valor)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {filtradas.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Nenhuma diária pendente de pagamento 🎉</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
