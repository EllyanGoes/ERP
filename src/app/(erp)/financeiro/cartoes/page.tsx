"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import PageHeader from "@/components/shared/PageHeader";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import DatePicker from "@/components/shared/DatePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn, formatBRL, formatDate } from "@/lib/utils";
import { usePersistedState } from "@/lib/use-persisted-state";
import { useTabTitle } from "@/lib/tabs-context";
import { CreditCard, Plus, Pencil, ArrowDownToLine, Zap, Landmark, CalendarClock } from "lucide-react";

// ── Tipos (espelho das APIs de /api/financeiro/cartoes) ──────────────────────
type Administradora = {
  id: string;
  nome: string;
  cnpj: string | null;
  ativo: boolean;
  contaBancariaId: string;
  saldoAtual: number;
  contaBancaria: { id: string; nome: string; contasContabeis: { id: string; codigo: string }[] } | null;
  _count: { maquinetas: number };
};
type TipoForma = "CARTAO_CREDITO" | "CARTAO_DEBITO";
type Taxa = { id?: string; tipoForma: TipoForma; taxaPct: string | number; diasCompensacao: number };
type Maquineta = {
  id: string;
  nome: string;
  ativo: boolean;
  administradoraId: string;
  administradora: { id: string; nome: string };
  taxas: Taxa[];
};
type LancPendente = {
  id: string;
  data: string;
  valor: number;
  descricao: string;
  maquineta: string | null;
  diasCompensacao: number;
  previsaoRepasse: string;
};
type AReceber = {
  administradoraId: string;
  nome: string;
  contaBancariaId: string;
  saldo: number;
  totalPendente: number;
  lancamentos: LancPendente[];
};
type ContaOpt = { id: string; nome: string; tipo: string; ativo: boolean; compensacao?: boolean; saldoAtual: number };

const ABAS = [
  ["administradoras", "Administradoras"],
  ["maquinetas", "Maquinetas"],
  ["a-receber", "A Receber"],
] as const;
type Aba = (typeof ABAS)[number][0];

export default function CartoesPage() {
  useTabTitle("Cartões");
  const [aba, setAba] = usePersistedState<Aba>("financeiro:cartoes:aba", "administradoras");
  const [loading, setLoading] = useState(true);
  const [admins, setAdmins] = useState<Administradora[]>([]);
  const [maquinetas, setMaquinetas] = useState<Maquineta[]>([]);
  const [aReceber, setAReceber] = useState<AReceber[]>([]);
  const [contas, setContas] = useState<ContaOpt[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [a, m, ar, c] = await Promise.all([
      fetch("/api/financeiro/cartoes/administradoras").then((r) => r.json()),
      fetch("/api/financeiro/cartoes/maquinetas").then((r) => r.json()),
      fetch("/api/financeiro/cartoes/a-receber").then((r) => r.json()),
      fetch("/api/financeiro/contas").then((r) => r.json()),
    ]);
    setAdmins(a.data ?? []);
    setMaquinetas(m.data ?? []);
    setAReceber(ar.data ?? []);
    setContas(c.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Destinos de repasse/antecipação: contas ativas da empresa (nunca outra conta
  // CARTAO nem a transitória de compensação).
  const contasDestino = useMemo(
    () => contas.filter((c) => c.ativo && c.tipo !== "CARTAO" && !c.compensacao),
    [contas],
  );

  return (
    <div>
      <PageHeader
        title="Cartões"
        breadcrumbs={[{ label: "Financeiro" }, { label: "Cartões" }]}
      />
      <div className="px-8 pb-8 space-y-4">
        <div className="flex border-b border-border">
          {ABAS.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setAba(k)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                aba === k ? "border-blue-600 text-info" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="px-6 py-10 text-sm text-muted-foreground text-center">Carregando...</p>
        ) : (
          <>
            {aba === "administradoras" && <AdministradorasTab admins={admins} onDone={load} />}
            {aba === "maquinetas" && <MaquinetasTab maquinetas={maquinetas} admins={admins} onDone={load} />}
            {aba === "a-receber" && <AReceberTab aReceber={aReceber} contasDestino={contasDestino} onDone={load} />}
          </>
        )}
      </div>
    </div>
  );
}

// ── Aba Administradoras ───────────────────────────────────────────────────────
function AdministradorasTab({ admins, onDone }: { admins: Administradora[]; onDone: () => void }) {
  const [dlg, setDlg] = useState<{ admin: Administradora | null } | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setDlg({ admin: null })}>
          <Plus className="w-4 h-4 mr-1.5" />Nova Administradora
        </Button>
      </div>
      <AdministradoraDialog
        admin={dlg?.admin ?? null}
        open={dlg !== null}
        onOpenChange={(v) => { if (!v) setDlg(null); }}
        onDone={() => { setDlg(null); onDone(); }}
      />
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {admins.length === 0 ? (
          <p className="px-6 py-10 text-sm text-muted-foreground text-center">
            Nenhuma administradora cadastrada. Clique em &quot;Nova Administradora&quot;.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="px-6 py-3 font-medium">Administradora</th>
                <th className="px-6 py-3 font-medium">CNPJ</th>
                <th className="px-6 py-3 font-medium">Maquinetas</th>
                <th className="px-6 py-3 font-medium text-right">A receber (saldo)</th>
                <th className="px-6 py-3 font-medium w-10" />
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id} className={`border-b border-gray-50 hover:bg-muted ${!a.ativo ? "opacity-50" : ""}`}>
                  <td className="px-6 py-3">
                    <span className="inline-flex items-center gap-2 font-medium text-foreground">
                      <CreditCard className="w-4 h-4 text-muted-foreground" />{a.nome}
                    </span>
                    {a.contaBancaria?.contasContabeis?.[0] && (
                      <p className="text-[11px] text-muted-foreground">Conta contábil {a.contaBancaria.contasContabeis[0].codigo}</p>
                    )}
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">{a.cnpj || "—"}</td>
                  <td className="px-6 py-3 text-muted-foreground">{a._count.maquinetas}</td>
                  <td className={`px-6 py-3 text-right font-semibold tabular-nums ${a.saldoAtual >= 0 ? "text-foreground" : "text-danger"}`}>
                    {formatBRL(a.saldoAtual)}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button onClick={() => setDlg({ admin: a })} className="text-muted-foreground/60 hover:text-info" title="Editar administradora">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function AdministradoraDialog({ admin, open, onOpenChange, onDone }: {
  admin: Administradora | null; open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void;
}) {
  const editing = !!admin;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [ativo, setAtivo] = useState(true);

  useEffect(() => {
    if (!open) return;
    setNome(admin?.nome ?? "");
    setCnpj(admin?.cnpj ?? "");
    setAtivo(admin?.ativo ?? true);
    setError("");
  }, [open, admin]);

  async function salvar() {
    if (!nome.trim()) return;
    setSaving(true);
    setError("");
    const res = await fetch(
      editing ? `/api/financeiro/cartoes/administradoras/${admin!.id}` : "/api/financeiro/cartoes/administradoras",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { nome, cnpj: cnpj || null, ativo } : { nome, cnpj: cnpj || null }),
      },
    );
    setSaving(false);
    if (res.ok) { onOpenChange(false); onDone(); }
    else {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Erro ao salvar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Editar administradora" : "Nova administradora"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {error && <div className="bg-danger/10 border border-danger/30 text-danger px-3 py-2 rounded-lg text-sm">{error}</div>}
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Stone, Cielo, Rede" />
            {!editing && (
              <p className="text-[11px] text-muted-foreground">
                Cria junto a conta de recebíveis da administradora em &quot;Cartões a Receber&quot; (1.1.8).
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>CNPJ</Label>
            <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
          </div>
          {editing && (
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
              <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="accent-blue-600" />
              Administradora ativa
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving || !nome.trim()}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Aba Maquinetas ────────────────────────────────────────────────────────────
function taxaDe(m: Maquineta, tipo: TipoForma) {
  return m.taxas.find((t) => t.tipoForma === tipo) ?? null;
}

function MaquinetasTab({ maquinetas, admins, onDone }: {
  maquinetas: Maquineta[]; admins: Administradora[]; onDone: () => void;
}) {
  const [dlg, setDlg] = useState<{ maquineta: Maquineta | null } | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setDlg({ maquineta: null })} disabled={admins.length === 0}
          title={admins.length === 0 ? "Cadastre uma administradora primeiro" : undefined}>
          <Plus className="w-4 h-4 mr-1.5" />Nova Maquineta
        </Button>
      </div>
      <MaquinetaDialog
        maquineta={dlg?.maquineta ?? null}
        admins={admins}
        open={dlg !== null}
        onOpenChange={(v) => { if (!v) setDlg(null); }}
        onDone={() => { setDlg(null); onDone(); }}
      />
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {maquinetas.length === 0 ? (
          <p className="px-6 py-10 text-sm text-muted-foreground text-center">
            Nenhuma maquineta cadastrada. Clique em &quot;Nova Maquineta&quot;.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="px-6 py-3 font-medium">Maquineta</th>
                <th className="px-6 py-3 font-medium">Administradora</th>
                <th className="px-6 py-3 font-medium">Crédito</th>
                <th className="px-6 py-3 font-medium">Débito</th>
                <th className="px-6 py-3 font-medium w-10" />
              </tr>
            </thead>
            <tbody>
              {maquinetas.map((m) => {
                const cred = taxaDe(m, "CARTAO_CREDITO");
                const deb = taxaDe(m, "CARTAO_DEBITO");
                const fmtTaxa = (t: Taxa | null) =>
                  t ? `${Number(t.taxaPct).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% · ${t.diasCompensacao}d` : "—";
                return (
                  <tr key={m.id} className={`border-b border-gray-50 hover:bg-muted ${!m.ativo ? "opacity-50" : ""}`}>
                    <td className="px-6 py-3 font-medium text-foreground">{m.nome}</td>
                    <td className="px-6 py-3 text-muted-foreground">{m.administradora?.nome ?? "—"}</td>
                    <td className="px-6 py-3 text-muted-foreground tabular-nums">{fmtTaxa(cred)}</td>
                    <td className="px-6 py-3 text-muted-foreground tabular-nums">{fmtTaxa(deb)}</td>
                    <td className="px-6 py-3 text-right">
                      <button onClick={() => setDlg({ maquineta: m })} className="text-muted-foreground/60 hover:text-info" title="Editar maquineta">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function MaquinetaDialog({ maquineta, admins, open, onOpenChange, onDone }: {
  maquineta: Maquineta | null; admins: Administradora[]; open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void;
}) {
  const editing = !!maquineta;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [nome, setNome] = useState("");
  const [administradoraId, setAdministradoraId] = useState("");
  const [ativo, setAtivo] = useState(true);
  // Taxas por tipo (string p/ digitação livre); vazio = tipo sem taxa cadastrada.
  const [credPct, setCredPct] = useState("");
  const [credDias, setCredDias] = useState("");
  const [debPct, setDebPct] = useState("");
  const [debDias, setDebDias] = useState("");

  useEffect(() => {
    if (!open) return;
    setNome(maquineta?.nome ?? "");
    setAdministradoraId(maquineta?.administradoraId ?? (admins.length === 1 ? admins[0].id : ""));
    setAtivo(maquineta?.ativo ?? true);
    const cred = maquineta ? taxaDe(maquineta, "CARTAO_CREDITO") : null;
    const deb = maquineta ? taxaDe(maquineta, "CARTAO_DEBITO") : null;
    setCredPct(cred ? String(cred.taxaPct) : "");
    setCredDias(cred ? String(cred.diasCompensacao) : "");
    setDebPct(deb ? String(deb.taxaPct) : "");
    setDebDias(deb ? String(deb.diasCompensacao) : "");
    setError("");
  }, [open, maquineta, admins]);

  async function salvar() {
    if (!nome.trim() || !administradoraId) return;
    const taxas: { tipoForma: TipoForma; taxaPct: string; diasCompensacao: string }[] = [];
    if (credPct !== "" || credDias !== "") taxas.push({ tipoForma: "CARTAO_CREDITO", taxaPct: credPct || "0", diasCompensacao: credDias || "0" });
    if (debPct !== "" || debDias !== "") taxas.push({ tipoForma: "CARTAO_DEBITO", taxaPct: debPct || "0", diasCompensacao: debDias || "0" });

    setSaving(true);
    setError("");
    const res = await fetch(
      editing ? `/api/financeiro/cartoes/maquinetas/${maquineta!.id}` : "/api/financeiro/cartoes/maquinetas",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, administradoraId, taxas, ...(editing ? { ativo } : {}) }),
      },
    );
    setSaving(false);
    if (res.ok) { onOpenChange(false); onDone(); }
    else {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Erro ao salvar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Editar maquineta" : "Nova maquineta"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {error && <div className="bg-danger/10 border border-danger/30 text-danger px-3 py-2 rounded-lg text-sm">{error}</div>}
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Stone Loja 1" />
          </div>
          <div className="space-y-1.5">
            <Label>Administradora *</Label>
            <ComboboxWithCreate value={administradoraId} onChange={setAdministradoraId} placeholder="Selecione..." noneLabel="Selecione" triggerClassName="h-10 rounded-lg"
              options={admins.filter((a) => a.ativo || a.id === administradoraId).map((a) => ({ value: a.id, label: a.nome }))} />
          </div>
          {([["Crédito", credPct, setCredPct, credDias, setCredDias], ["Débito", debPct, setDebPct, debDias, setDebDias]] as const).map(
            ([label, pct, setPct, dias, setDias]) => (
              <div key={label} className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Taxa {label.toLowerCase()} (%)</Label>
                  <Input type="number" step="0.01" min="0" max="100" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="Ex: 3,19" />
                </div>
                <div className="space-y-1.5">
                  <Label>Compensação {label.toLowerCase()} (dias)</Label>
                  <Input type="number" step="1" min="0" value={dias} onChange={(e) => setDias(e.target.value)} placeholder="Ex: 30" />
                </div>
              </div>
            ),
          )}
          {editing && (
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
              <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="accent-blue-600" />
              Maquineta ativa
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving || !nome.trim() || !administradoraId}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Aba A Receber ─────────────────────────────────────────────────────────────
function AReceberTab({ aReceber, contasDestino, onDone }: {
  aReceber: AReceber[]; contasDestino: ContaOpt[]; onDone: () => void;
}) {
  if (aReceber.length === 0) {
    return (
      <p className="px-6 py-10 text-sm text-muted-foreground text-center rounded-xl border border-border bg-card">
        Nenhuma administradora ativa — cadastre na aba Administradoras.
      </p>
    );
  }
  return (
    <div className="space-y-6">
      {aReceber.map((ar) => (
        <AReceberCard key={ar.administradoraId} ar={ar} contasDestino={contasDestino} onDone={onDone} />
      ))}
    </div>
  );
}

function AReceberCard({ ar, contasDestino, onDone }: {
  ar: AReceber; contasDestino: ContaOpt[]; onDone: () => void;
}) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [dlgRepasse, setDlgRepasse] = useState(false);
  const [dlgAntecipacao, setDlgAntecipacao] = useState(false);

  const toggle = (id: string) =>
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const todosMarcados = ar.lancamentos.length > 0 && ar.lancamentos.every((l) => selecionados.has(l.id));
  const valorSelecionado = ar.lancamentos.filter((l) => selecionados.has(l.id)).reduce((s, l) => s + l.valor, 0);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-border">
        <div>
          <p className="font-semibold text-foreground inline-flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-muted-foreground" />{ar.nome}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Saldo a receber: <span className={cn("font-semibold tabular-nums", ar.saldo >= 0 ? "text-foreground" : "text-danger")}>{formatBRL(ar.saldo)}</span>
            {" · "}Pendente de repasse: <span className="font-semibold tabular-nums text-foreground">{formatBRL(ar.totalPendente)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDlgAntecipacao(true)} disabled={ar.saldo <= 0}>
            <Zap className="w-4 h-4 mr-1.5" />Antecipação
          </Button>
          <Button onClick={() => setDlgRepasse(true)} disabled={ar.saldo <= 0}>
            <ArrowDownToLine className="w-4 h-4 mr-1.5" />Registrar repasse
          </Button>
        </div>
      </div>

      {ar.lancamentos.length === 0 ? (
        <p className="px-6 py-6 text-sm text-muted-foreground">Nenhuma venda pendente de repasse.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="px-6 py-2.5 w-10">
                <input
                  type="checkbox"
                  className="accent-blue-600"
                  checked={todosMarcados}
                  onChange={() => setSelecionados(todosMarcados ? new Set() : new Set(ar.lancamentos.map((l) => l.id)))}
                  title="Marcar todos"
                />
              </th>
              <th className="px-3 py-2.5 font-medium">Data</th>
              <th className="px-3 py-2.5 font-medium">Descrição</th>
              <th className="px-3 py-2.5 font-medium">Maquineta</th>
              <th className="px-3 py-2.5 font-medium">Previsão de repasse</th>
              <th className="px-6 py-2.5 font-medium text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {ar.lancamentos.map((l) => (
              <tr key={l.id} className="border-b border-gray-50 hover:bg-muted cursor-pointer" onClick={() => toggle(l.id)}>
                <td className="px-6 py-2.5">
                  <input type="checkbox" className="accent-blue-600" checked={selecionados.has(l.id)} onChange={() => toggle(l.id)} onClick={(e) => e.stopPropagation()} />
                </td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{formatDate(l.data)}</td>
                <td className="px-3 py-2.5 text-foreground">{l.descricao}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{l.maquineta ?? "—"}</td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <CalendarClock className="w-3.5 h-3.5" />{formatDate(l.previsaoRepasse)}
                    <span className="text-[11px]">({l.diasCompensacao}d)</span>
                  </span>
                </td>
                <td className="px-6 py-2.5 text-right font-semibold tabular-nums text-foreground">{formatBRL(l.valor)}</td>
              </tr>
            ))}
          </tbody>
          {selecionados.size > 0 && (
            <tfoot>
              <tr className="bg-muted/50">
                <td colSpan={5} className="px-6 py-2 text-xs font-medium text-muted-foreground">
                  {selecionados.size} venda{selecionados.size > 1 ? "s" : ""} selecionada{selecionados.size > 1 ? "s" : ""}
                </td>
                <td className="px-6 py-2 text-right text-xs font-semibold tabular-nums text-foreground">{formatBRL(valorSelecionado)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      )}

      <RepasseDialog
        ar={ar}
        contasDestino={contasDestino}
        lancamentoIds={Array.from(selecionados)}
        valorSugerido={valorSelecionado > 0 ? valorSelecionado : ar.saldo}
        open={dlgRepasse}
        onOpenChange={setDlgRepasse}
        onDone={() => { setDlgRepasse(false); setSelecionados(new Set()); onDone(); }}
      />
      <AntecipacaoDialog
        ar={ar}
        contasDestino={contasDestino}
        open={dlgAntecipacao}
        onOpenChange={setDlgAntecipacao}
        onDone={() => { setDlgAntecipacao(false); setSelecionados(new Set()); onDone(); }}
      />
    </div>
  );
}

function RepasseDialog({ ar, contasDestino, lancamentoIds, valorSugerido, open, onOpenChange, onDone }: {
  ar: AReceber; contasDestino: ContaOpt[]; lancamentoIds: string[]; valorSugerido: number;
  open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [contaDestinoId, setContaDestinoId] = useState("");
  const [valor, setValor] = useState("");
  const [valorDiferenca, setValorDiferenca] = useState("");
  const [dataLancamento, setDataLancamento] = useState("");

  useEffect(() => {
    if (!open) return;
    setContaDestinoId("");
    setValor(valorSugerido > 0 ? valorSugerido.toFixed(2) : "");
    setValorDiferenca("");
    setDataLancamento(new Date().toISOString().slice(0, 10));
    setError("");
  }, [open, valorSugerido]);

  async function salvar() {
    setSaving(true);
    setError("");
    const res = await fetch("/api/financeiro/cartoes/repasse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        administradoraId: ar.administradoraId,
        contaDestinoId,
        valor,
        valorDiferenca: valorDiferenca || 0,
        dataLancamento,
        lancamentoIds,
      }),
    });
    setSaving(false);
    if (res.ok) onDone();
    else {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Erro ao registrar repasse");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Registrar repasse — {ar.nome}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {error && <div className="bg-danger/10 border border-danger/30 text-danger px-3 py-2 rounded-lg text-sm">{error}</div>}
          <p className="text-xs text-muted-foreground">
            Transfere da conta da administradora ({formatBRL(ar.saldo)} a receber) para o banco.
            {lancamentoIds.length > 0 && ` As ${lancamentoIds.length} venda(s) selecionada(s) serão marcadas como repassadas.`}
          </p>
          <div className="space-y-1.5">
            <Label>Conta de destino *</Label>
            <ComboboxWithCreate value={contaDestinoId} onChange={setContaDestinoId} placeholder="Selecione..." noneLabel="Selecione" triggerClassName="h-10 rounded-lg"
              options={contasDestino.map((c) => ({ value: c.id, label: `${c.nome} (${formatBRL(c.saldoAtual)})` }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor depositado *</Label>
              <Input type="number" step="0.01" min="0" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <DatePicker value={dataLancamento} onChange={(v) => setDataLancamento(v)} className="w-full" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Diferença de taxa (opcional)</Label>
            <Input type="number" step="0.01" min="0" value={valorDiferenca} onChange={(e) => setValorDiferenca(e.target.value)} placeholder="0,00" />
            <p className="text-[11px] text-muted-foreground">
              Taxa descontada a maior no repasse — vira despesa &quot;Taxa de cartão&quot; e abate o saldo da administradora.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving || !contaDestinoId || !valor}>
            <Landmark className="w-4 h-4 mr-1.5" />{saving ? "Registrando..." : "Registrar repasse"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AntecipacaoDialog({ ar, contasDestino, open, onOpenChange, onDone }: {
  ar: AReceber; contasDestino: ContaOpt[]; open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [contaDestinoId, setContaDestinoId] = useState("");
  const [valorBruto, setValorBruto] = useState("");
  const [valorDesagio, setValorDesagio] = useState("");
  const [dataLancamento, setDataLancamento] = useState("");

  useEffect(() => {
    if (!open) return;
    setContaDestinoId("");
    setValorBruto(ar.saldo > 0 ? ar.saldo.toFixed(2) : "");
    setValorDesagio("");
    setDataLancamento(new Date().toISOString().slice(0, 10));
    setError("");
  }, [open, ar.saldo]);

  const liquido = Math.round(((parseFloat(valorBruto) || 0) - (parseFloat(valorDesagio) || 0)) * 100) / 100;

  async function salvar() {
    setSaving(true);
    setError("");
    const res = await fetch("/api/financeiro/cartoes/antecipacao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        administradoraId: ar.administradoraId,
        contaDestinoId,
        valorBruto,
        valorDesagio: valorDesagio || 0,
        dataLancamento,
      }),
    });
    setSaving(false);
    if (res.ok) onDone();
    else {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Erro ao registrar antecipação");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Antecipação — {ar.nome}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {error && <div className="bg-danger/10 border border-danger/30 text-danger px-3 py-2 rounded-lg text-sm">{error}</div>}
          <p className="text-xs text-muted-foreground">
            A administradora deposita o líquido (bruto − deságio) antes do prazo; o deságio vira despesa financeira.
          </p>
          <div className="space-y-1.5">
            <Label>Conta de destino *</Label>
            <ComboboxWithCreate value={contaDestinoId} onChange={setContaDestinoId} placeholder="Selecione..." noneLabel="Selecione" triggerClassName="h-10 rounded-lg"
              options={contasDestino.map((c) => ({ value: c.id, label: `${c.nome} (${formatBRL(c.saldoAtual)})` }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor bruto antecipado *</Label>
              <Input type="number" step="0.01" min="0" value={valorBruto} onChange={(e) => setValorBruto(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Deságio *</Label>
              <Input type="number" step="0.01" min="0" value={valorDesagio} onChange={(e) => setValorDesagio(e.target.value)} placeholder="0,00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data</Label>
              <DatePicker value={dataLancamento} onChange={(v) => setDataLancamento(v)} className="w-full" />
            </div>
            <div className="space-y-1.5">
              <Label>Líquido a receber</Label>
              <div className={cn("h-10 rounded-lg border border-border px-3 flex items-center text-sm font-semibold tabular-nums bg-muted", liquido <= 0 ? "text-danger" : "text-foreground")}>
                {formatBRL(liquido)}
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving || !contaDestinoId || !valorBruto || liquido <= 0}>
            <Zap className="w-4 h-4 mr-1.5" />{saving ? "Registrando..." : "Registrar antecipação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
