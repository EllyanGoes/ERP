"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import DatePicker from "@/components/shared/DatePicker";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { formatBRL, cn } from "@/lib/utils";
import { usePersistedState } from "@/lib/use-persisted-state";
import { Wallet, Plus, ArrowLeftRight, ExternalLink, Landmark, Pencil, ShieldCheck, Lock, Layers } from "lucide-react";

type Conta = {
  id: string;
  nome: string;
  agencia: string | null;
  numero: string | null;
  tipo: "CORRENTE" | "POUPANCA" | "CAIXA";
  saldoInicial: string | number;
  saldoAtual: number;
  ativo: boolean;
  compensacao?: boolean;
  ehTerceiro?: boolean;
  terceiroNome?: string | null;
  banco: { id: string; nome: string } | null;
  contasContabeis?: { id: string; codigo: string; nome: string }[];
};
type Banco = { id: string; nome: string };

const TIPO_LABEL: Record<Conta["tipo"], string> = {
  CORRENTE: "Conta Corrente",
  POUPANCA: "Poupança",
  CAIXA: "Caixa",
};

export default function ContasBancariasPage() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [loading, setLoading] = useState(true);
  // Diálogo de conta: null = fechado; { conta: null } = nova; { conta } = editar.
  const [dlg, setDlg] = useState<{ conta: Conta | null } | null>(null);
  // Agrupar as contas: por tipo (Caixa / Conta Corrente…) ou por titularidade
  // (Da empresa / Terceiros). Persistido por usuário.
  const [agrupar, setAgrupar] = usePersistedState<"none" | "tipo" | "titularidade">("financeiro:contas:agrupar", "none");

  const load = useCallback(async () => {
    setLoading(true);
    const [c, b] = await Promise.all([
      fetch("/api/financeiro/contas").then((r) => r.json()),
      fetch("/api/financeiro/bancos").then((r) => r.json()),
    ]);
    setContas(c.data ?? []);
    setBancos(b.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = contas.filter((c) => c.ativo).reduce((s, c) => s + (c.saldoAtual ?? 0), 0);

  // Agrupamento por tipo ou por titularidade (compensação vira grupo próprio).
  const ORDEM_TIPO = ["Caixa", "Conta Corrente", "Poupança", "Compensação"];
  const ORDEM_TIT = ["Da empresa", "Terceiros", "Compensação"];
  const grupos = (() => {
    if (agrupar === "none") return null;
    const chaveDe = (c: Conta) =>
      c.compensacao ? "Compensação"
        : agrupar === "titularidade" ? (c.ehTerceiro ? "Terceiros" : "Da empresa")
        : TIPO_LABEL[c.tipo];
    const ordem = agrupar === "titularidade" ? ORDEM_TIT : ORDEM_TIPO;
    const map = new Map<string, Conta[]>();
    for (const c of contas) {
      const key = chaveDe(c);
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return Array.from(map.keys())
      .sort((a, b) => (ordem.indexOf(a) + 1 || 99) - (ordem.indexOf(b) + 1 || 99))
      .map((k) => {
        const cs = map.get(k)!;
        return { key: k, label: k, contas: cs, total: cs.filter((c) => c.ativo).reduce((s, c) => s + (c.saldoAtual ?? 0), 0) };
      });
  })();

  return (
    <div>
      <PageHeader
        title="Contas"
        breadcrumbs={[{ label: "Financeiro" }, { label: "Contas" }]}
        action={
          <div className="flex gap-2">
            <TransferenciaDialog contas={contas.filter((c) => c.ativo)} onDone={load} />
            <Button onClick={() => setDlg({ conta: null })}>
              <Plus className="w-4 h-4 mr-1.5" />Nova Conta
            </Button>
          </div>
        }
      />

      <ContaDialog
        bancos={bancos}
        conta={dlg?.conta ?? null}
        open={dlg !== null}
        onOpenChange={(v) => { if (!v) setDlg(null); }}
        onDone={() => { setDlg(null); load(); }}
      />
      <div className="px-8 pb-8 space-y-6">
        {/* Saldo total */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl p-4 bg-info/10 text-info">
            <p className="text-sm font-medium opacity-75">Saldo total</p>
            <p className="text-3xl font-bold mt-1">{formatBRL(total)}</p>
          </div>
          <div className="rounded-xl p-4 bg-muted text-foreground">
            <p className="text-sm font-medium opacity-75">Contas ativas</p>
            <p className="text-3xl font-bold mt-1">{contas.filter((c) => c.ativo).length}</p>
          </div>
        </div>

        {/* Agrupar por tipo ou titularidade (persistido) */}
        {!loading && contas.length > 0 && (
          <div className="flex justify-end gap-2">
            {([["tipo", "Por tipo"], ["titularidade", "Por titularidade"]] as const).map(([mode, lbl]) => (
              <button
                key={mode}
                onClick={() => setAgrupar((v) => (v === mode ? "none" : mode))}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  agrupar === mode
                    ? "border-indigo-300 dark:border-indigo-500/40 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
                title={`Agrupar as contas ${lbl.toLowerCase()}`}
              >
                <Layers className="w-3.5 h-3.5" /> {lbl}
              </button>
            ))}
          </div>
        )}

        {/* Tabela */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {loading ? (
            <p className="px-6 py-10 text-sm text-muted-foreground text-center">Carregando...</p>
          ) : contas.length === 0 ? (
            <p className="px-6 py-10 text-sm text-muted-foreground text-center">
              Nenhuma conta cadastrada. Clique em &quot;Nova Conta&quot;.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="px-6 py-3 font-medium">Conta</th>
                  <th className="px-6 py-3 font-medium">Banco</th>
                  <th className="px-6 py-3 font-medium">Tipo</th>
                  <th className="px-6 py-3 font-medium text-right">Saldo atual</th>
                  <th className="px-6 py-3 font-medium w-10" />
                </tr>
              </thead>
              <tbody>
                {(agrupar !== "none" && grupos ? grupos : [{ key: "__all__", label: "", contas, total: 0 }]).map((g) => (
                  <Fragment key={g.key}>
                    {agrupar !== "none" && (
                      <tr className="bg-muted/50 border-y border-border">
                        <td colSpan={2} className="px-6 py-2">
                          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground">
                            <Layers className="w-3.5 h-3.5 text-muted-foreground" /> {g.label}
                            <span className="font-normal normal-case text-muted-foreground">· {g.contas.length}</span>
                          </span>
                        </td>
                        <td />
                        <td className="px-6 py-2 text-right text-xs font-semibold tabular-nums text-foreground">{formatBRL(g.total)}</td>
                        <td />
                      </tr>
                    )}
                    {g.contas.map((c) => (
                  <tr key={c.id} className={`border-b border-gray-50 hover:bg-muted ${!c.ativo ? "opacity-50" : ""}`}>
                    <td className="px-6 py-3">
                      <Link href={`/financeiro/contas/${c.id}`} className="font-medium text-foreground hover:text-info">
                        {c.nome}
                      </Link>
                      {(c.agencia || c.numero) && (
                        <p className="text-xs text-muted-foreground">
                          {c.agencia ? `Ag. ${c.agencia}` : ""}{c.agencia && c.numero ? " · " : ""}{c.numero ? `C/C ${c.numero}` : ""}
                        </p>
                      )}
                      {c.contasContabeis?.[0] && (
                        <p className="text-[11px] text-muted-foreground">Conta contábil {c.contasContabeis[0].codigo}</p>
                      )}
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {c.banco ? (
                        <span className="inline-flex items-center gap-1.5"><Landmark className="w-3.5 h-3.5 text-muted-foreground" />{c.banco.nome}</span>
                      ) : "—"}
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {c.compensacao ? (
                        <span
                          title="Conta transitória do Encontro de Contas — gerada pelo sistema, não pode ser excluída."
                          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400"
                        >
                          <ShieldCheck className="w-3 h-3" /> Compensação
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          {TIPO_LABEL[c.tipo]}
                          {c.ehTerceiro && (
                            <span title={c.terceiroNome ?? "Conta de terceiros"} className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                              Terceiros{c.terceiroNome ? ` · ${c.terceiroNome}` : ""}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className={`px-6 py-3 text-right font-semibold tabular-nums ${c.saldoAtual >= 0 ? "text-foreground" : "text-danger"}`}>
                      {formatBRL(c.saldoAtual)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {c.compensacao ? (
                          <span title="Conta do sistema — não editável nem excluível" className="text-muted-foreground/50">
                            <Lock className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <button onClick={() => setDlg({ conta: c })} className="text-muted-foreground/60 hover:text-info" title="Editar conta">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <Link href={`/financeiro/contas/${c.id}`} className="text-muted-foreground/60 hover:text-blue-500" title="Abrir conta">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// Diálogo controlado de conta bancária: cria (conta=null) ou edita (conta preenchida).
function ContaDialog({ bancos, conta, open, onOpenChange, onDone }: {
  bancos: Banco[]; conta: Conta | null; open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void;
}) {
  const editing = !!conta;
  const [saving, setSaving] = useState(false);
  const [nome, setNome] = useState("");
  const [bancoId, setBancoId] = useState("");
  const [agencia, setAgencia] = useState("");
  const [numero, setNumero] = useState("");
  const [tipo, setTipo] = useState<Conta["tipo"]>("CORRENTE");
  const [saldoInicial, setSaldoInicial] = useState("0");
  const [ativo, setAtivo] = useState(true);
  const [ehTerceiro, setEhTerceiro] = useState(false);
  const [terceiroNome, setTerceiroNome] = useState("");

  // Ao abrir, preenche a partir da conta (edição) ou zera (nova).
  useEffect(() => {
    if (!open) return;
    setNome(conta?.nome ?? "");
    setBancoId(conta?.banco?.id ?? "");
    setAgencia(conta?.agencia ?? "");
    setNumero(conta?.numero ?? "");
    setTipo(conta?.tipo ?? "CORRENTE");
    setSaldoInicial(String(conta?.saldoInicial ?? "0"));
    setAtivo(conta?.ativo ?? true);
    setEhTerceiro(conta?.ehTerceiro ?? false);
    setTerceiroNome(conta?.terceiroNome ?? "");
  }, [open, conta]);

  async function salvar() {
    if (!nome.trim()) return;
    setSaving(true);
    const res = await fetch(editing ? `/api/financeiro/contas/${conta!.id}` : "/api/financeiro/contas", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome,
        bancoId: ehTerceiro ? null : (bancoId || null),
        agencia: ehTerceiro ? null : agencia,
        numero: ehTerceiro ? null : numero,
        tipo, saldoInicial, ativo, ehTerceiro, terceiroNome: ehTerceiro ? terceiroNome : null,
      }),
    });
    setSaving(false);
    if (res.ok) { onOpenChange(false); onDone(); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Editar conta bancária" : "Nova conta bancária"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Itaú Movimento" />
          </div>
          <div className="space-y-1.5">
            <Label>Titularidade</Label>
            <div className="flex gap-2">
              {([[false, "Da empresa"], [true, "De terceiros"]] as const).map(([v, lbl]) => (
                <button key={lbl} type="button" onClick={() => setEhTerceiro(v)}
                  className={cn("flex-1 h-10 rounded-lg border text-sm font-medium transition-colors",
                    ehTerceiro === v ? "border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" : "border-border text-muted-foreground hover:text-foreground")}>
                  {lbl}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {ehTerceiro ? "Vai para “Contas de Terceiros” (1.1.6) no plano de contas." : "Vai para Disponibilidades (1.1.1)."}
            </p>
          </div>
          {ehTerceiro && (
            <div className="space-y-1.5">
              <Label>Nome do terceiro *</Label>
              <Input value={terceiroNome} onChange={(e) => setTerceiroNome(e.target.value)} placeholder="De quem é a conta" />
            </div>
          )}
          {/* Terceiros não têm banco/agência/número fixos (usam várias contas). */}
          <div className={cn("grid gap-3", ehTerceiro ? "grid-cols-1" : "grid-cols-2")}>
            {!ehTerceiro && (
              <div className="space-y-1.5">
                <Label>Banco</Label>
                <ComboboxWithCreate value={bancoId} onChange={setBancoId} placeholder="— Nenhum —" noneLabel="Nenhum" triggerClassName="h-10 rounded-lg"
                  options={bancos.map((b) => ({ value: b.id, label: b.nome }))} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as Conta["tipo"])} className="w-full h-10 rounded-lg border border-border px-3 text-sm bg-card">
                <option value="CORRENTE">Conta Corrente</option>
                <option value="POUPANCA">Poupança</option>
                <option value="CAIXA">Caixa</option>
              </select>
            </div>
          </div>
          <div className={cn("grid gap-3", ehTerceiro ? "grid-cols-1" : "grid-cols-3")}>
            {!ehTerceiro && (
              <>
                <div className="space-y-1.5">
                  <Label>Agência</Label>
                  <Input value={agencia} onChange={(e) => setAgencia(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Número</Label>
                  <Input value={numero} onChange={(e) => setNumero(e.target.value)} />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label>Saldo inicial</Label>
              <Input type="number" step="0.01" value={saldoInicial} onChange={(e) => setSaldoInicial(e.target.value)} />
            </div>
          </div>
          {editing && (
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
              <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="accent-blue-600" />
              Conta ativa
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving || !nome.trim() || (ehTerceiro && !terceiroNome.trim())}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferenciaDialog({ contas, onDone }: { contas: Conta[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [contaOrigemId, setContaOrigemId] = useState("");
  const [contaDestinoId, setContaDestinoId] = useState("");
  const [valor, setValor] = useState("");
  const [dataLancamento, setDataLancamento] = useState(new Date().toISOString().slice(0, 10));
  const [descricao, setDescricao] = useState("");

  async function salvar() {
    setError("");
    const res = await fetch("/api/financeiro/transferencias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contaOrigemId, contaDestinoId, valor, dataLancamento, descricao }),
    });
    if (res.ok) {
      setOpen(false);
      setContaOrigemId(""); setContaDestinoId(""); setValor(""); setDescricao("");
      onDone();
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Erro ao transferir");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <ArrowLeftRight className="w-4 h-4 mr-1.5" />Transferência
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Transferência entre contas</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {error && <div className="bg-danger/10 border border-danger/30 text-danger px-3 py-2 rounded-lg text-sm">{error}</div>}
          <div className="space-y-1.5">
            <Label>De (origem)</Label>
            <ComboboxWithCreate value={contaOrigemId} onChange={setContaOrigemId} placeholder="Selecione..." noneLabel="Selecione" triggerClassName="h-10 rounded-lg"
              options={contas.filter((c) => !c.compensacao).map((c) => ({ value: c.id, label: `${c.nome} (${formatBRL(c.saldoAtual)})` }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Para (destino)</Label>
            <ComboboxWithCreate value={contaDestinoId} onChange={setContaDestinoId} placeholder="Selecione..." noneLabel="Selecione" triggerClassName="h-10 rounded-lg"
              options={contas.filter((c) => !c.compensacao).map((c) => ({ value: c.id, label: `${c.nome} (${formatBRL(c.saldoAtual)})` }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor</Label>
              <Input type="number" step="0.01" min="0" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <DatePicker value={dataLancamento} onChange={(v) => setDataLancamento(v)} className="w-full" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Descrição (opcional)</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Transferência entre contas" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving || !contaOrigemId || !contaDestinoId || !valor}>Transferir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
