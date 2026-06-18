"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import PageHeader from "@/components/shared/PageHeader";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatDate } from "@/lib/utils";
import { ArrowLeftRight, Building2, Loader2, PackageOpen, Users, X } from "lucide-react";

type Saldo = {
  id: string;
  quantidadeAtual: string;
  item: { id: string; codigo: string; descricao: string; unidadeMedida: string; unidade: { sigla: string } | null };
  localEstoque: { id: string; nome: string } | null;
  clienteDono: { id: string; razaoSocial: string; nomeFantasia: string | null };
};
type Mov = {
  id: string;
  tipo: string;
  quantidade: string;
  saldoDepois: string;
  documento: string | null;
  observacoes: string | null;
  createdAt: string;
  item: { codigo: string; descricao: string };
  localEstoque: { nome: string } | null;
  clienteDono: { razaoSocial: string; nomeFantasia: string | null };
  lote: { numero: string } | null;
};
type ClienteOpt = { id: string; razaoSocial: string; nomeFantasia: string | null };
type ItemOpt = { id: string; codigo: string; descricao: string };
type LocalOpt = { id: string; nome: string };

const num = (v: unknown) => parseFloat(String(v ?? 0));
const fmtQtd = (v: unknown) => num(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export default function EstoqueTerceirosPage() {
  const [saldos, setSaldos] = useState<Saldo[]>([]);
  const [movs, setMovs] = useState<Mov[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState<"saldos" | "lancamentos">("saldos");

  // modal de reclassificação
  const [showModal, setShowModal] = useState(false);
  const [clientes, setClientes] = useState<ClienteOpt[]>([]);
  const [itens, setItens] = useState<ItemOpt[]>([]);
  const [locais, setLocais] = useState<LocalOpt[]>([]);
  const [form, setForm] = useState({ itemId: "", localEstoqueId: "", de: "", para: "", quantidade: "", observacoes: "" });
  const [salvando, setSalvando] = useState(false);
  const [formErro, setFormErro] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const res = await fetch("/api/suprimentos/estoque-terceiros");
      const json = await res.json();
      if (!res.ok) { setErro(json.error ?? "Erro ao carregar"); return; }
      setSaldos(json.data.saldos);
      setMovs(json.data.movimentacoes);
    } catch {
      setErro("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    Promise.all([
      fetch("/api/clientes?limit=500").then((r) => r.json()),
      fetch("/api/suprimentos/produtos").then((r) => r.json()),
      fetch("/api/suprimentos/locais-estoque").then((r) => r.json()),
    ]).then(([clis, prods, locs]) => {
      setClientes(Array.isArray(clis) ? clis : (clis.data ?? []));
      setItens(prods.data ?? []);
      setLocais(Array.isArray(locs) ? locs : (locs.data ?? []));
    });
  }, []);

  // agrupa saldos por cliente
  const porCliente = useMemo(() => {
    const mapa = new Map<string, { nome: string; linhas: Saldo[]; total: number }>();
    for (const s of saldos) {
      if (num(s.quantidadeAtual) === 0) continue;
      const chave = s.clienteDono.id;
      const atual = mapa.get(chave) ?? { nome: s.clienteDono.nomeFantasia ?? s.clienteDono.razaoSocial, linhas: [], total: 0 };
      atual.linhas.push(s);
      atual.total += num(s.quantidadeAtual);
      mapa.set(chave, atual);
    }
    return Array.from(mapa.entries()).sort((a, b) => a[1].nome.localeCompare(b[1].nome));
  }, [saldos]);

  function abrirReclassificar(saldo?: Saldo) {
    setFormErro("");
    setForm(saldo
      ? { itemId: saldo.item.id, localEstoqueId: saldo.localEstoque?.id ?? "", de: saldo.clienteDono.id, para: "", quantidade: "", observacoes: "" }
      : { itemId: "", localEstoqueId: "", de: "", para: "", quantidade: "", observacoes: "" });
    setShowModal(true);
  }

  async function reclassificar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.itemId || !form.localEstoqueId) { setFormErro("Informe o produto e o local de estoque"); return; }
    const qtd = parseFloat(form.quantidade);
    if (!qtd || qtd <= 0) { setFormErro("Informe a quantidade"); return; }
    if (form.de === form.para) { setFormErro("Origem e destino são o mesmo proprietário"); return; }
    setSalvando(true);
    setFormErro("");
    try {
      const res = await fetch("/api/suprimentos/estoque-terceiros/reclassificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: form.itemId,
          localEstoqueId: form.localEstoqueId,
          deClienteDonoId: form.de || null,
          paraClienteDonoId: form.para || null,
          quantidade: qtd,
          observacoes: form.observacoes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setFormErro(json.error ?? "Erro ao reclassificar"); return; }
      setShowModal(false);
      await carregar();
    } catch {
      setFormErro("Erro de conexão");
    } finally {
      setSalvando(false);
    }
  }

  const selectCls = "w-full h-9 px-3 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-1 focus:ring-blue-400";
  const optDono = (incluiProprio: boolean) => (
    <>
      {incluiProprio && <option value="">Estoque próprio</option>}
      {clientes.map((c) => (
        <option key={c.id} value={c.id}>{c.nomeFantasia || c.razaoSocial}</option>
      ))}
    </>
  );

  return (
    <div>
      <PageHeader
        title="Estoque de Terceiros"
        breadcrumbs={[{ label: "Almoxarifado" }, { label: "Estoque de Terceiros" }]}
        action={
          <Button size="sm" onClick={() => abrirReclassificar()}>
            <ArrowLeftRight className="w-4 h-4 mr-1.5" />
            Reclassificar propriedade
          </Button>
        }
      />

      <div className="px-8 pb-12 space-y-6">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <PackageOpen className="w-3.5 h-3.5" />
          Mercadoria de clientes armazenada sob a guarda da empresa. Esses saldos fazem parte do
          estoque físico, mas não entram no custo médio, no estoque mínimo nem nos relatórios de consumo.
        </p>

        {erro && <div className="bg-danger/10 border border-danger/30 text-danger text-sm px-4 py-3 rounded-xl">{erro}</div>}

        {loading ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* cards resumo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-warning" />Clientes com saldo
                  </CardTitle>
                </CardHeader>
                <CardContent><p className="text-xl font-semibold">{porCliente.length}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-warning" />Quantidade sob guarda
                  </CardTitle>
                </CardHeader>
                <CardContent><p className="text-xl font-semibold">{fmtQtd(porCliente.reduce((s, [, c]) => s + c.total, 0))}</p></CardContent>
              </Card>
            </div>

            {/* abas */}
            <div className="flex items-center gap-1 border-b border-border">
              {([["saldos", "Saldos por cliente"], ["lancamentos", "Lançamentos"]] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setAba(k)}
                  className={cn(
                    "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                    aba === k ? "border-blue-600 text-info" : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {aba === "saldos" && (
              porCliente.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma mercadoria de terceiro sob guarda.</p>
              ) : (
                <div className="space-y-5">
                  {porCliente.map(([clienteId, grupo]) => (
                    <section key={clienteId} className="bg-card border border-border rounded-2xl overflow-hidden">
                      <div className="px-5 py-3 bg-warning/10 border-b border-border flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-foreground">{grupo.nome}</h3>
                        <span className="text-xs text-muted-foreground">{fmtQtd(grupo.total)} un. sob guarda</span>
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-muted-foreground border-b border-border">
                            <th className="px-5 py-2 font-medium">Produto</th>
                            <th className="px-5 py-2 font-medium">Local</th>
                            <th className="px-5 py-2 font-medium text-right">Quantidade</th>
                            <th className="px-5 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {grupo.linhas.map((s) => (
                            <tr key={s.id} className="border-b border-gray-50">
                              <td className="px-5 py-2.5">
                                <span className="font-mono text-xs text-muted-foreground mr-2">{s.item.codigo}</span>
                                {s.item.descricao}
                              </td>
                              <td className="px-5 py-2.5 text-muted-foreground">{s.localEstoque?.nome ?? "—"}</td>
                              <td className="px-5 py-2.5 text-right font-semibold">
                                {fmtQtd(s.quantidadeAtual)} {s.item.unidade?.sigla ?? s.item.unidadeMedida}
                              </td>
                              <td className="px-5 py-2.5 text-right">
                                <Button variant="outline" size="sm" onClick={() => abrirReclassificar(s)}>
                                  <ArrowLeftRight className="w-3.5 h-3.5 mr-1" />Reclassificar
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </section>
                  ))}
                </div>
              )
            )}

            {aba === "lancamentos" && (
              <section className="bg-card border border-border rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted">
                      <th className="px-5 py-2.5 font-medium">Data</th>
                      <th className="px-5 py-2.5 font-medium">Tipo</th>
                      <th className="px-5 py-2.5 font-medium">Produto</th>
                      <th className="px-5 py-2.5 font-medium">Proprietário</th>
                      <th className="px-5 py-2.5 font-medium">Local</th>
                      <th className="px-5 py-2.5 font-medium text-right">Qtd</th>
                      <th className="px-5 py-2.5 font-medium text-right">Saldo</th>
                      <th className="px-5 py-2.5 font-medium">Lote/Doc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movs.length === 0 && (
                      <tr><td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">Nenhum lançamento.</td></tr>
                    )}
                    {movs.map((m) => (
                      <tr key={m.id} className="border-b border-gray-50">
                        <td className="px-5 py-2 text-muted-foreground text-xs">{formatDate(m.createdAt)}</td>
                        <td className="px-5 py-2">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-medium",
                            m.tipo === "ENTRADA" ? "bg-success/10 text-success"
                              : m.tipo === "SAIDA" ? "bg-danger/10 text-danger"
                              : "bg-muted text-muted-foreground"
                          )}>{m.tipo}</span>
                        </td>
                        <td className="px-5 py-2"><span className="font-mono text-xs text-muted-foreground mr-1.5">{m.item.codigo}</span>{m.item.descricao}</td>
                        <td className="px-5 py-2 text-muted-foreground">{m.clienteDono.nomeFantasia || m.clienteDono.razaoSocial}</td>
                        <td className="px-5 py-2 text-muted-foreground">{m.localEstoque?.nome ?? "—"}</td>
                        <td className="px-5 py-2 text-right font-medium">{fmtQtd(m.quantidade)}</td>
                        <td className="px-5 py-2 text-right text-muted-foreground">{fmtQtd(m.saldoDepois)}</td>
                        <td className="px-5 py-2 text-xs text-muted-foreground">{m.lote?.numero ?? m.documento ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}
      </div>

      {/* ── Modal de reclassificação ─────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => !salvando && setShowModal(false)}>
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-info" />Reclassificar propriedade
              </h2>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={reclassificar} className="px-6 py-5 space-y-4">
              <p className="text-xs text-muted-foreground">
                Move a quantidade entre proprietários do mesmo produto/local, sem alterar o total físico
                (gera um lote de AJUSTE com as duas pernas).
              </p>
              {formErro && <div className="bg-danger/10 border border-danger/30 text-danger text-xs px-3 py-2 rounded-lg">{formErro}</div>}

              <div className="space-y-1.5">
                <Label>Produto <span className="text-red-500">*</span></Label>
                <ComboboxWithCreate value={form.itemId} onChange={(v) => setForm({ ...form, itemId: v })}
                  placeholder="Selecionar..." noneLabel="Selecionar" triggerClassName="h-9 rounded-lg"
                  options={itens.map((i) => ({ value: i.id, label: `${i.codigo} — ${i.descricao}` }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Local de Estoque <span className="text-red-500">*</span></Label>
                <ComboboxWithCreate value={form.localEstoqueId} onChange={(v) => setForm({ ...form, localEstoqueId: v })}
                  placeholder="Selecionar..." noneLabel="Selecionar" triggerClassName="h-9 rounded-lg"
                  options={locais.map((l) => ({ value: l.id, label: l.nome }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>De (dono atual)</Label>
                  <ComboboxWithCreate value={form.de} onChange={(v) => setForm({ ...form, de: v })}
                    noneLabel="Estoque próprio" triggerClassName="h-9 rounded-lg"
                    options={clientes.map((c) => ({ value: c.id, label: c.nomeFantasia || c.razaoSocial }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Para (novo dono)</Label>
                  <ComboboxWithCreate value={form.para} onChange={(v) => setForm({ ...form, para: v })}
                    noneLabel="Estoque próprio" triggerClassName="h-9 rounded-lg"
                    options={clientes.map((c) => ({ value: c.id, label: c.nomeFantasia || c.razaoSocial }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Quantidade <span className="text-red-500">*</span></Label>
                  <Input type="number" step="0.001" min="0.001" value={form.quantidade}
                    onChange={(e) => setForm({ ...form, quantidade: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Observações</Label>
                  <Input value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowModal(false)} disabled={salvando}>Cancelar</Button>
                <Button type="submit" size="sm" disabled={salvando}>
                  {salvando ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Reclassificando...</> : "Reclassificar"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
