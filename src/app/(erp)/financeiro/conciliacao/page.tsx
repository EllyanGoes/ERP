"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDate, cn } from "@/lib/utils";
import { Upload, Link2, Plus, Unlink, CheckCircle2, FileCheck2 } from "lucide-react";

type Conta = { id: string; nome: string };
type Importacao = {
  id: string;
  nomeArquivo: string | null;
  dataImportacao: string;
  contaBancaria: { id: string; nome: string };
  _count: { linhas: number };
};
type Sugestao = { id: string; descricao: string; valor: string | number; tipo: string; dataLancamento: string };
type Linha = {
  id: string;
  data: string;
  valor: string | number;
  descricao: string | null;
  lancamentoConciliadoId: string | null;
  lancamentoConciliado: { id: string; descricao: string; valor: string | number; tipo: string } | null;
  sugestoes: Sugestao[];
};
type Detalhe = { id: string; contaBancaria: { id: string; nome: string }; linhas: Linha[] };

export default function ConciliacaoPage() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [importacoes, setImportacoes] = useState<Importacao[]>([]);
  const [contaId, setContaId] = useState("");
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [importando, setImportando] = useState(false);
  const [msg, setMsg] = useState("");

  const loadBase = useCallback(async () => {
    const [c, imp] = await Promise.all([
      fetch("/api/financeiro/contas").then((r) => r.json()),
      fetch("/api/financeiro/ofx").then((r) => r.json()),
    ]);
    setContas((c.data ?? []).map((x: any) => ({ id: x.id, nome: x.nome })));
    setImportacoes(imp.data ?? []);
  }, []);

  useEffect(() => { loadBase(); }, [loadBase]);

  const abrir = useCallback(async (id: string) => {
    const j = await fetch(`/api/financeiro/ofx/${id}`).then((r) => r.json());
    setDetalhe(j.data ?? null);
  }, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!contaId) { setMsg("Selecione a conta antes de importar."); return; }
    setMsg("");
    setImportando(true);
    const conteudo = await file.text();
    const res = await fetch("/api/financeiro/ofx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contaBancariaId: contaId, nomeArquivo: file.name, conteudo }),
    });
    setImportando(false);
    e.target.value = "";
    if (res.ok) {
      const j = await res.json();
      setMsg(j.ignoradas > 0 ? `Importado. ${j.ignoradas} linha(s) já existiam e foram ignoradas.` : "Importado com sucesso.");
      await loadBase();
      abrir(j.data.id);
    } else {
      const j = await res.json().catch(() => ({}));
      setMsg(j.error || "Erro ao importar OFX");
    }
  }

  async function conciliar(linhaId: string, lancamentoId: string) {
    const res = await fetch("/api/financeiro/ofx/conciliar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linhaId, lancamentoId }),
    });
    if (res.ok && detalhe) abrir(detalhe.id);
  }
  async function desconciliar(linhaId: string) {
    const res = await fetch(`/api/financeiro/ofx/conciliar?linhaId=${linhaId}`, { method: "DELETE" });
    if (res.ok && detalhe) abrir(detalhe.id);
  }
  async function criarLancamento(linhaId: string) {
    const res = await fetch("/api/financeiro/ofx/criar-lancamento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linhaId }),
    });
    if (res.ok && detalhe) abrir(detalhe.id);
  }

  const totalLinhas = detalhe?.linhas.length ?? 0;
  const conciliadas = detalhe?.linhas.filter((l) => l.lancamentoConciliadoId).length ?? 0;

  return (
    <div>
      <PageHeader title="Conciliação Bancária (OFX)" breadcrumbs={[{ label: "Financeiro" }, { label: "Conciliação (OFX)" }]} />
      <div className="px-8 pb-8 space-y-6">
        {/* Importar */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-500">Conta bancária</label>
            <select value={contaId} onChange={(e) => setContaId(e.target.value)} className="h-10 rounded-lg border border-gray-300 px-3 text-sm bg-white min-w-[200px]">
              <option value="">Selecione...</option>
              {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <label className={cn(
            "inline-flex items-center gap-2 h-10 px-4 rounded-lg text-sm font-medium cursor-pointer",
            contaId ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-gray-200 text-gray-400 cursor-not-allowed",
          )}>
            <Upload className="w-4 h-4" />
            {importando ? "Importando..." : "Importar arquivo OFX"}
            <input type="file" accept=".ofx,.OFX,text/plain" className="hidden" disabled={!contaId || importando} onChange={onFile} />
          </label>
          {msg && <span className="text-sm text-gray-500">{msg}</span>}
        </div>

        <div className="grid grid-cols-[280px_1fr] gap-6">
          {/* Importações */}
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden h-fit">
            <div className="px-4 py-3 border-b border-gray-100"><h2 className="font-semibold text-gray-900 text-sm">Importações</h2></div>
            {importacoes.length === 0 ? (
              <p className="px-4 py-6 text-xs text-gray-400 text-center">Nenhuma importação ainda.</p>
            ) : (
              <ul>
                {importacoes.map((imp) => (
                  <li key={imp.id}>
                    <button
                      onClick={() => abrir(imp.id)}
                      className={cn("w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50", detalhe?.id === imp.id && "bg-blue-50")}
                    >
                      <p className="text-sm font-medium text-gray-800 truncate">{imp.nomeArquivo || "Extrato OFX"}</p>
                      <p className="text-xs text-gray-400">{imp.contaBancaria.nome} · {formatDate(imp.dataImportacao)} · {imp._count.linhas} linhas</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Linhas da importação selecionada */}
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            {!detalhe ? (
              <div className="py-16 text-center text-sm text-gray-400">
                <FileCheck2 className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                Importe um OFX ou selecione uma importação para conciliar.
              </div>
            ) : (
              <>
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">{detalhe.contaBancaria.nome}</h2>
                  <span className="text-xs text-gray-500">{conciliadas}/{totalLinhas} conciliadas</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {detalhe.linhas.map((l) => {
                    const v = Number(l.valor);
                    return (
                      <div key={l.id} className="px-5 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900 truncate">{l.descricao || "—"}</p>
                            <p className="text-xs text-gray-400">{formatDate(l.data)}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className={cn("text-sm font-semibold tabular-nums", v >= 0 ? "text-emerald-700" : "text-red-600")}>
                              {v >= 0 ? "+" : "−"}{formatBRL(Math.abs(v))}
                            </span>
                          </div>
                        </div>

                        {l.lancamentoConciliadoId ? (
                          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2">
                            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Conciliada com: {l.lancamentoConciliado?.descricao}
                            </span>
                            <button onClick={() => desconciliar(l.id)} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-600">
                              <Unlink className="w-3.5 h-3.5" /> Desfazer
                            </button>
                          </div>
                        ) : (
                          <div className="mt-2 space-y-1.5">
                            {l.sugestoes.length > 0 ? (
                              l.sugestoes.map((s) => (
                                <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-1.5">
                                  <span className="text-xs text-gray-600 truncate">
                                    {s.descricao} <span className="text-gray-400">· {formatDate(s.dataLancamento)}</span>
                                  </span>
                                  <Button size="sm" variant="outline" onClick={() => conciliar(l.id, s.id)}>
                                    <Link2 className="w-3.5 h-3.5 mr-1" /> Conciliar
                                  </Button>
                                </div>
                              ))
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-gray-400">Sem correspondência encontrada</span>
                                <Button size="sm" variant="outline" onClick={() => criarLancamento(l.id)}>
                                  <Plus className="w-3.5 h-3.5 mr-1" /> Criar lançamento
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
