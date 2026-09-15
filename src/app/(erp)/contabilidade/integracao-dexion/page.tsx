"use client";

// Integração Dexion — processo do módulo contábil que lê a cópia do banco
// Firebird do escritório contábil: conexão, vínculo empresa×exercício,
// balancete do contador e comparativo com o balancete do ERP via De-Para.
import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTabTitle } from "@/lib/tabs-context";
import { useSession } from "@/lib/session-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import {
  Loader2, Plug, Wifi, WifiOff, Save, Eye, EyeOff, Link2, Trash2, RefreshCw, Download, Building2, Scale, GitCompare, AlertTriangle, CheckCircle2,
} from "lucide-react";

type Aba = "conexao" | "vinculos" | "balancete" | "comparativo";

type DexionEmpresaDTO = { codigo: number; nome: string; fantasia: string | null; cnpj: string | null; exercicio: number | null; sugestaoEmpresaId: string | null; sugestaoEmpresaNome: string | null };
type VinculoDTO = { id: string; empresaId: string; exercicio: number; codigoDexion: number };
type ContaDexionDTO = { conta: string; descricao: string; nivel: number; sintetica: boolean; natureza: string | null; saldoInicial: number; debitos: number; creditos: number; saldoFinal: number; mensal: number[] };
type LinhaComparativo = ContaDexionDTO & { erpContaId: string | null; erpCodigo: string | null; erpNome: string | null; saldoErp: number | null; diferenca: number | null };
type ContaErpDTO = { id: string; codigo: string; nome: string; nivel: number; aceitaLancamento: boolean };

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const fmt = (v: number | null | undefined) => v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function IntegracaoDexionPage() {
  const { user } = useSession();
  useTabTitle("Integração Dexion");
  const empresas = user?.empresas ?? [];
  const [aba, setAba] = usePersistedState<Aba>("contab:dexion:aba", "conexao");
  const [empresaId, setEmpresaId] = usePersistedState<string>("contab:dexion:empresa", user?.activeEmpresaId ?? empresas[0]?.id ?? "emp_tramontin");
  const [exercicio, setExercicio] = usePersistedState<number>("contab:dexion:exercicio", new Date().getFullYear());
  const [ate, setAte] = usePersistedState<number>("contab:dexion:ate", new Date().getMonth() + 1);
  const [erro, setErro] = useState("");

  const abas: { k: Aba; label: string; icone: React.ReactNode }[] = [
    { k: "conexao", label: "Conexão", icone: <Plug className="w-4 h-4" /> },
    { k: "vinculos", label: "Vínculos", icone: <Building2 className="w-4 h-4" /> },
    { k: "balancete", label: "Balancete do contador", icone: <Scale className="w-4 h-4" /> },
    { k: "comparativo", label: "Comparativo ERP × Dexion", icone: <GitCompare className="w-4 h-4" /> },
  ];

  return (
    <div>
      <PageHeader
        title="Integração Dexion"
        breadcrumbs={[{ label: "Contabilidade" }, { label: "Integração Dexion" }]}
        subtitle="Leitura da cópia do banco Firebird do escritório contábil — balancete do contador e comparativo com o ERP"
      />
      <div className="px-8 pb-8 space-y-4">
        <div className="flex items-center gap-1 border-b border-border">
          {abas.map((a) => (
            <button
              key={a.k}
              onClick={() => { setAba(a.k); setErro(""); }}
              className={cn("inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors", aba === a.k ? "border-info text-info" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              {a.icone} {a.label}
            </button>
          ))}
        </div>

        {erro && (
          <div className="flex items-center gap-2 rounded-lg bg-danger/10 text-danger text-sm px-3 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {erro}
          </div>
        )}

        {aba === "conexao" && <AbaConexao isAdmin={user?.perfil === "ADMIN"} onErro={setErro} />}
        {aba === "vinculos" && <AbaVinculos empresas={empresas} onErro={setErro} />}
        {(aba === "balancete" || aba === "comparativo") && (
          <FiltrosPeriodo empresas={empresas} empresaId={empresaId} setEmpresaId={setEmpresaId} exercicio={exercicio} setExercicio={setExercicio} ate={ate} setAte={setAte} />
        )}
        {aba === "balancete" && <AbaBalancete empresaId={empresaId} exercicio={exercicio} ate={ate} onErro={setErro} />}
        {aba === "comparativo" && <AbaComparativo empresaId={empresaId} exercicio={exercicio} ate={ate} onErro={setErro} />}
      </div>
    </div>
  );
}

// ── Conexão ─────────────────────────────────────────────────────────────────
function AbaConexao({ isAdmin, onErro }: { isAdmin: boolean; onErro: (m: string) => void }) {
  const [cfg, setCfg] = useState({ host: "", port: "3050", database: "", user: "sysdba", password: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [testando, setTestando] = useState(false);
  const [status, setStatus] = useState<{ conectado?: boolean; engine?: string; tabelas?: number; configurado?: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/contabilidade/dexion/config").then((r) => r.json()).then((j) => {
      const d = j.data ?? {};
      setCfg({ host: d.host ?? "", port: String(d.port ?? 3050), database: d.database ?? "", user: d.user ?? "sysdba", password: d.password ?? "" });
    }).finally(() => setLoading(false));
  }, []);

  const set = (k: keyof typeof cfg) => (v: string) => { setCfg((c) => ({ ...c, [k]: v })); setDirty(true); };

  async function salvar() {
    setSaving(true); onErro("");
    const res = await fetch("/api/contabilidade/dexion/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) }).catch(() => null);
    setSaving(false);
    if (!res?.ok) { onErro((await res?.json().catch(() => ({})))?.error || "Não foi possível salvar."); return; }
    setDirty(false);
    testar();
  }

  async function testar() {
    setTestando(true); onErro(""); setStatus(null);
    const res = await fetch("/api/contabilidade/dexion/status").catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setTestando(false);
    if (!res?.ok) { setStatus({ conectado: false }); onErro(j?.error || "Falha na conexão."); return; }
    setStatus(j.data);
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <Campo label="Host" desc="IP na rede local ou o endereço DDNS do servidor do contador"><Input value={cfg.host} onChange={(e) => set("host")(e.target.value)} placeholder="192.168.0.17" className="h-9 font-mono text-sm" disabled={!isAdmin} /></Campo>
          <Campo label="Porta"><Input value={cfg.port} onChange={(e) => set("port")(e.target.value)} placeholder="3050" className="h-9 font-mono text-sm" disabled={!isAdmin} /></Campo>
        </div>
        <Campo label="Caminho do banco (.fdb)" desc="Caminho no servidor Windows onde o Firebird enxerga o arquivo"><Input value={cfg.database} onChange={(e) => set("database")(e.target.value)} placeholder="C:\Program Files (x86)\Dexion_DB-BKP\Dexion.fdb" className="h-9 font-mono text-sm" disabled={!isAdmin} /></Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Usuário"><Input value={cfg.user} onChange={(e) => set("user")(e.target.value)} className="h-9 font-mono text-sm" disabled={!isAdmin} /></Campo>
          <Campo label="Senha">
            <div className="relative">
              <Input type={showPwd ? "text" : "password"} value={cfg.password} onChange={(e) => set("password")(e.target.value)} className="h-9 font-mono text-sm pr-10" disabled={!isAdmin} />
              <button type="button" onClick={() => setShowPwd((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" tabIndex={-1}>
                {showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </Campo>
        </div>
        <div className="flex items-center gap-2 pt-1">
          {isAdmin && (
            <Button size="sm" onClick={salvar} disabled={saving || !dirty}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />} Salvar
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={testar} disabled={testando}>
            {testando ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Wifi className="w-3.5 h-3.5 mr-1.5" />} Testar conexão
          </Button>
          {!isAdmin && <span className="text-xs text-muted-foreground">Só administradores alteram a conexão.</span>}
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <p className="text-sm font-semibold text-foreground">Status</p>
        {status === null ? (
          <p className="text-sm text-muted-foreground">Clique em “Testar conexão”.</p>
        ) : status.conectado ? (
          <div className="space-y-1.5 text-sm">
            <p className="inline-flex items-center gap-1.5 text-success font-medium"><CheckCircle2 className="w-4 h-4" /> Conectado</p>
            <p className="text-muted-foreground">Firebird {status.engine}</p>
            <p className="text-muted-foreground">{status.tabelas} tabelas de usuário</p>
          </div>
        ) : (
          <p className="inline-flex items-center gap-1.5 text-danger text-sm font-medium"><WifiOff className="w-4 h-4" /> Sem conexão</p>
        )}
        <div className="pt-2 border-t border-border text-xs text-muted-foreground space-y-1">
          <p>O banco é uma cópia somente leitura. Nada é gravado no Dexion.</p>
          <p>No Dexion cada exercício é uma “empresa” com código próprio. Faça o vínculo na aba seguinte.</p>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {desc && <p className="text-[11px] text-muted-foreground leading-tight">{desc}</p>}
      {children}
    </div>
  );
}

// ── Vínculos ────────────────────────────────────────────────────────────────
function AbaVinculos({ empresas, onErro }: { empresas: { id: string; nome: string }[]; onErro: (m: string) => void }) {
  const [dexion, setDexion] = useState<DexionEmpresaDTO[] | null>(null);
  const [vinculos, setVinculos] = useState<VinculoDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [novo, setNovo] = useState({ empresaId: empresas[0]?.id ?? "", exercicio: String(new Date().getFullYear()), codigoDexion: "" });
  const [salvando, setSalvando] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); onErro("");
    const [e, v] = await Promise.all([
      fetch("/api/contabilidade/dexion/empresas").then((r) => r.json()).catch(() => ({})),
      fetch("/api/contabilidade/dexion/vinculos").then((r) => r.json()).catch(() => ({})),
    ]);
    if (e.error) onErro(e.error);
    setDexion(e.data ?? []);
    setVinculos(v.data ?? []);
    setLoading(false);
  }, [onErro]);
  useEffect(() => { load(); }, [load]);

  // Sugestão: empresa do Dexion cujo CNPJ bate e cujo exercício é o escolhido.
  const sugestao = useMemo(() => (dexion ?? []).find((d) => d.sugestaoEmpresaId === novo.empresaId && d.exercicio === Number(novo.exercicio)), [dexion, novo]);
  useEffect(() => { if (sugestao && !novo.codigoDexion) setNovo((n) => ({ ...n, codigoDexion: String(sugestao.codigo) })); }, [sugestao, novo.codigoDexion]);

  async function salvar() {
    setSalvando(true); onErro("");
    const res = await fetch("/api/contabilidade/dexion/vinculos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(novo) }).catch(() => null);
    setSalvando(false);
    if (!res?.ok) { onErro((await res?.json().catch(() => ({})))?.error || "Não foi possível salvar."); return; }
    setNovo((n) => ({ ...n, codigoDexion: "" }));
    load();
  }
  async function remover(id: string) {
    await fetch(`/api/contabilidade/dexion/vinculos?id=${id}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  const nomeEmpresa = (id: string) => empresas.find((e) => e.id === id)?.nome ?? id;
  const nomeDexion = (codigo: number) => { const d = dexion?.find((x) => x.codigo === codigo); return d ? `${d.codigo} · ${d.fantasia || d.nome}${d.exercicio ? ` (${d.exercicio})` : ""}` : String(codigo); };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5 w-56">
          <Label className="text-xs text-muted-foreground">Empresa no ERP</Label>
          <SelectMenu value={novo.empresaId} onChange={(v) => setNovo((n) => ({ ...n, empresaId: v, codigoDexion: "" }))} options={empresas.map((e) => ({ value: e.id, label: e.nome }))} />
        </div>
        <div className="space-y-1.5 w-28">
          <Label className="text-xs text-muted-foreground">Exercício</Label>
          <Input value={novo.exercicio} onChange={(e) => setNovo((n) => ({ ...n, exercicio: e.target.value, codigoDexion: "" }))} className="h-9 text-sm" />
        </div>
        <div className="space-y-1.5 w-96">
          <Label className="text-xs text-muted-foreground">Empresa no Dexion {sugestao && <span className="text-success">· sugerida pelo CNPJ</span>}</Label>
          <SelectMenu
            value={novo.codigoDexion}
            onChange={(v) => setNovo((n) => ({ ...n, codigoDexion: v }))}
            placeholder="Escolha a empresa/exercício do Dexion"
            options={(dexion ?? []).map((d) => ({ value: String(d.codigo), label: `${d.codigo} · ${d.fantasia || d.nome}${d.exercicio ? ` (${d.exercicio})` : ""}${d.cnpj ? ` — ${d.cnpj}` : ""}` }))}
          />
        </div>
        <Button size="sm" onClick={salvar} disabled={salvando || !novo.codigoDexion || !novo.empresaId}>
          {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Link2 className="w-3.5 h-3.5 mr-1.5" />} Vincular
        </Button>
        <Button size="sm" variant="ghost" onClick={load} title="Recarregar"><RefreshCw className="w-3.5 h-3.5" /></Button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr><th className="text-left px-4 py-2">Empresa no ERP</th><th className="text-left px-4 py-2">Exercício</th><th className="text-left px-4 py-2">Empresa no Dexion</th><th className="px-4 py-2" /></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {vinculos.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">Nenhum vínculo. Escolha a empresa, o exercício e a empresa correspondente no Dexion.</td></tr>}
            {vinculos.map((v) => (
              <tr key={v.id}>
                <td className="px-4 py-2 text-foreground">{nomeEmpresa(v.empresaId)}</td>
                <td className="px-4 py-2 text-foreground">{v.exercicio}</td>
                <td className="px-4 py-2 text-foreground">{nomeDexion(v.codigoDexion)}</td>
                <td className="px-4 py-2 text-right"><button onClick={() => remover(v.id)} className="text-muted-foreground hover:text-danger" title="Remover"><Trash2 className="w-4 h-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Filtros comuns ──────────────────────────────────────────────────────────
function FiltrosPeriodo({ empresas, empresaId, setEmpresaId, exercicio, setExercicio, ate, setAte }: {
  empresas: { id: string; nome: string }[]; empresaId: string; setEmpresaId: (v: string) => void;
  exercicio: number; setExercicio: (v: number) => void; ate: number; setAte: (v: number) => void;
}) {
  const anos = Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - i);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {empresas.length > 1 && <SelectMenu value={empresaId} onChange={setEmpresaId} className="w-56" options={empresas.map((e) => ({ value: e.id, label: e.nome }))} />}
      <SelectMenu value={String(exercicio)} onChange={(v) => setExercicio(Number(v))} className="w-28" options={anos.map((a) => ({ value: String(a), label: String(a) }))} />
      <SelectMenu value={String(ate)} onChange={(v) => setAte(Number(v))} className="w-36" options={MESES.map((m, i) => ({ value: String(i + 1), label: `até ${m}` }))} />
    </div>
  );
}

// ── Balancete do contador ───────────────────────────────────────────────────
function AbaBalancete({ empresaId, exercicio, ate, onErro }: { empresaId: string; exercicio: number; ate: number; onErro: (m: string) => void }) {
  const [nivel, setNivel] = usePersistedState<number>("contab:dexion:nivel", 3);
  const [busca, setBusca] = useState("");
  const [contas, setContas] = useState<ContaDexionDTO[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); onErro("");
    const res = await fetch(`/api/contabilidade/dexion/balancete?empresaId=${empresaId}&exercicio=${exercicio}&ate=${ate}`).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setLoading(false);
    if (!res?.ok) { onErro(j?.error || "Não foi possível carregar o balancete."); setContas(null); return; }
    setContas(j.data ?? []);
  }, [empresaId, exercicio, ate, onErro]);
  useEffect(() => { load(); }, [load]);

  const visiveis = (contas ?? []).filter((c) => c.nivel <= nivel && (!busca || c.descricao.toLowerCase().includes(busca.toLowerCase()) || c.conta.startsWith(busca)));

  function exportar() {
    const linhas = (contas ?? []).map((c) => ({
      Conta: c.conta, Descrição: c.descricao, Nível: c.nivel, Tipo: c.sintetica ? "Sintética" : "Analítica",
      "Saldo inicial": c.saldoInicial, Débitos: c.debitos, Créditos: c.creditos, "Saldo final": c.saldoFinal,
      ...Object.fromEntries(MESES.map((m, i) => [m, c.mensal[i]])),
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Balancete ${exercicio}`);
    XLSX.writeFile(wb, `balancete-dexion-${exercicio}-ate-${MESES[ate - 1]}.xlsx`);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SelectMenu value={String(nivel)} onChange={(v) => setNivel(Number(v))} className="w-40" options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: n === 6 ? "Todas (analíticas)" : `Até nível ${n}` }))} />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar conta ou descrição…" className="h-9 w-64 text-sm" />
        <Button size="sm" variant="outline" onClick={exportar} disabled={!contas?.length} className="ml-auto"><Download className="w-3.5 h-3.5 mr-1.5" /> Planilha</Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : contas && (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Conta</th><th className="text-left px-3 py-2">Descrição</th>
                <th className="text-right px-3 py-2">Saldo inicial</th><th className="text-right px-3 py-2">Débitos</th><th className="text-right px-3 py-2">Créditos</th><th className="text-right px-3 py-2">Saldo final</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visiveis.map((c) => (
                <tr key={c.conta} className={cn(c.sintetica && c.nivel <= 2 && "bg-muted/40 font-semibold")}>
                  <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground whitespace-nowrap">{c.conta}</td>
                  <td className="px-3 py-1.5 text-foreground" style={{ paddingLeft: 12 + (c.nivel - 1) * 12 }}>{c.descricao}</td>
                  <td className="px-3 py-1.5 text-right">{fmt(c.saldoInicial)}</td>
                  <td className="px-3 py-1.5 text-right">{fmt(c.debitos)}</td>
                  <td className="px-3 py-1.5 text-right">{fmt(c.creditos)}</td>
                  <td className={cn("px-3 py-1.5 text-right", c.saldoFinal < 0 && "text-info")}>{fmt(c.saldoFinal)}</td>
                </tr>
              ))}
              {visiveis.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nada encontrado.</td></tr>}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border">Convenção do Dexion: saldo devedor positivo, credor negativo (em azul). {visiveis.length} contas.</p>
        </div>
      )}
    </div>
  );
}

// ── Comparativo ERP × Dexion ────────────────────────────────────────────────
function AbaComparativo({ empresaId, exercicio, ate, onErro }: { empresaId: string; exercicio: number; ate: number; onErro: (m: string) => void }) {
  const [nivel, setNivel] = usePersistedState<number>("contab:dexion:comp:nivel", 3);
  const [soMapeadas, setSoMapeadas] = usePersistedState<boolean>("contab:dexion:comp:mapeadas", false);
  const [linhas, setLinhas] = useState<LinhaComparativo[] | null>(null);
  const [contasErp, setContasErp] = useState<ContaErpDTO[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); onErro("");
    const res = await fetch(`/api/contabilidade/dexion/comparativo?empresaId=${empresaId}&exercicio=${exercicio}&ate=${ate}&nivel=6`).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setLoading(false);
    if (!res?.ok) { onErro(j?.error || "Não foi possível montar o comparativo."); setLinhas(null); return; }
    setLinhas(j.data ?? []);
    setContasErp(j.contasErp ?? []);
  }, [empresaId, exercicio, ate, onErro]);
  useEffect(() => { load(); }, [load]);

  const opcoesErp = useMemo(() => contasErp
    .slice()
    .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }))
    .map((c) => ({ value: c.id, label: `${c.codigo} ${c.nome}`, code: c.codigo, group: c.aceitaLancamento ? "Analíticas" : "Sintéticas" })), [contasErp]);

  async function mapear(contaDexion: string, contaContabilId: string) {
    onErro("");
    const res = await fetch("/api/contabilidade/dexion/de-para", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresaId, contaDexion, contaContabilId: contaContabilId || null }) }).catch(() => null);
    if (!res?.ok) { onErro((await res?.json().catch(() => ({})))?.error || "Não foi possível salvar o De-Para."); return; }
    load();
  }

  const visiveis = (linhas ?? []).filter((l) => l.nivel <= nivel && (!soMapeadas || l.erpContaId));
  const mapeadas = (linhas ?? []).filter((l) => l.erpContaId);
  const divergentes = mapeadas.filter((l) => Math.abs(l.diferenca ?? 0) >= 0.01);

  function exportar() {
    const ws = XLSX.utils.json_to_sheet(visiveis.map((l) => ({
      "Conta Dexion": l.conta, "Descrição Dexion": l.descricao, "Saldo Dexion": l.saldoFinal,
      "Conta ERP": l.erpCodigo ?? "", "Descrição ERP": l.erpNome ?? "", "Saldo ERP": l.saldoErp ?? "", Diferença: l.diferenca ?? "",
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Comparativo");
    XLSX.writeFile(wb, `comparativo-erp-dexion-${exercicio}-ate-${MESES[ate - 1]}.xlsx`);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SelectMenu value={String(nivel)} onChange={(v) => setNivel(Number(v))} className="w-40" options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: n === 6 ? "Todas (analíticas)" : `Até nível ${n}` }))} />
        <label className="inline-flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
          <input type="checkbox" checked={soMapeadas} onChange={(e) => setSoMapeadas(e.target.checked)} className="accent-blue-600" /> Só contas mapeadas
        </label>
        {linhas && (
          <span className="text-xs text-muted-foreground">
            {mapeadas.length} mapeadas · <span className={divergentes.length ? "text-danger font-medium" : "text-success font-medium"}>{divergentes.length} com diferença</span>
          </span>
        )}
        <Button size="sm" variant="outline" onClick={exportar} disabled={!visiveis.length} className="ml-auto"><Download className="w-3.5 h-3.5 mr-1.5" /> Planilha</Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : linhas && (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Conta Dexion</th><th className="text-left px-3 py-2">Descrição</th><th className="text-right px-3 py-2">Saldo Dexion</th>
                <th className="text-left px-3 py-2 min-w-72">Conta no ERP (De-Para)</th><th className="text-right px-3 py-2">Saldo ERP</th><th className="text-right px-3 py-2">Diferença</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visiveis.map((l) => (
                <tr key={l.conta} className={cn(l.sintetica && l.nivel <= 2 && "bg-muted/40 font-semibold")}>
                  <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground whitespace-nowrap">{l.conta}</td>
                  <td className="px-3 py-1.5 text-foreground" style={{ paddingLeft: 12 + (l.nivel - 1) * 12 }}>{l.descricao}</td>
                  <td className={cn("px-3 py-1.5 text-right", l.saldoFinal < 0 && "text-info")}>{fmt(l.saldoFinal)}</td>
                  <td className="px-3 py-1.5 font-normal">
                    <ComboboxWithCreate
                      options={opcoesErp}
                      value={l.erpContaId ?? ""}
                      onChange={(v) => mapear(l.conta, v)}
                      allowNone
                      noneLabel="— não mapeada —"
                      placeholder="Escolher conta do ERP"
                      triggerClassName="h-8 text-xs"
                      menuMinWidth={420}
                    />
                  </td>
                  <td className={cn("px-3 py-1.5 text-right", (l.saldoErp ?? 0) < 0 && "text-info")}>{fmt(l.saldoErp)}</td>
                  <td className={cn("px-3 py-1.5 text-right font-medium", l.diferenca == null ? "text-muted-foreground" : Math.abs(l.diferenca) < 0.01 ? "text-success" : "text-danger")}>{l.diferenca == null ? "—" : Math.abs(l.diferenca) < 0.01 ? "OK" : fmt(l.diferenca)}</td>
                </tr>
              ))}
              {visiveis.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nada a mostrar neste filtro.</td></tr>}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border">
            Saldo do ERP = partidas até o último dia do mês escolhido, somando as analíticas descendentes da conta mapeada. Diferença = Dexion − ERP.
          </p>
        </div>
      )}
    </div>
  );
}
