"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import DatePicker from "@/components/shared/DatePicker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn, formatDate, formatBRL } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";
import {
  Pencil, Trash2, Loader2, AlertTriangle, Save, X, Phone, UserCheck, Share2, Search,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Filial    = { id: string; razaoSocial: string; nomeFantasia: string | null };
type Empresa   = { id: string; razaoSocial: string; nomeFantasia: string | null };
type Usuario   = { id: string; nome: string; email: string };
type SetorOpt  = { id: string; nome: string; ativo: boolean };
type EtapaInfo = { id: string; ordem: number; nome: string | null; fluxo: { id: string; nome: string } };

type FaixaHorario = { horaInicial: string; horaFinal: string };
type Escala = {
  id: string;
  data: string;
  horario: { id: string; nome: string; faixas: FaixaHorario[] };
};
type HorarioOpt = { id: string; nome: string; ativo: boolean; faixas: FaixaHorario[] };

type Diaria = {
  id: string; folhaId: string; data: string; status: string;
  setor: string | null; turno: string; servico: string | null; valor: number;
};

type Colaborador = {
  id:              string;
  nome:            string;
  cpf:             string | null;
  rg:              string | null;
  email:           string | null;
  telefone:        string | null;
  telegramChatId:  string | null;
  cargo:           string | null;
  classificacaoCusto: "MOD" | "MOI" | "ADMIN" | null;
  valorHora:     string | number | null;
  tipoColaborador: "FUNCIONARIO" | "PRESTADOR";
  matricula:       string | null;
  setorId:         string | null;
  setor:           { id: string; nome: string } | null;
  dataAdmissao:    string | null;
  dataDemissao:    string | null;
  filiais:         Filial[];
  empresas:        Empresa[];
  usuarioId:       string | null;
  usuario:         Usuario | null;
  ativo:           boolean;
  observacoes:     string | null;
  areasOperacao:   string[];
  createdAt:       string;
  updatedAt:       string;
  etapasAprovacao: EtapaInfo[];
};

const CLASSIF_LABEL: Record<string, string> = {
  MOD: "MOD — Mão de obra direta",
  MOI: "MOI — Mão de obra indireta",
  ADMIN: "Administrativo / Comercial",
};

// ── Field helpers ─────────────────────────────────────────────────────────────

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-0.5">{label}</p>
      <div className="text-sm text-foreground">{children ?? <span className="text-muted-foreground/60">—</span>}</div>
    </div>
  );
}

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ColaboradorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [colaborador, setColaborador] = useState<Colaborador | null>(null);
  useTabTitle(colaborador?.nome ?? null);
  const [loading, setLoading]         = useState(true);
  const [error,   setError]           = useState("");

  // Abas (mesmo padrão do cadastro de produtos)
  const [tab, setTab] = useState<"pessoais" | "funcionais" | "escala" | "diarias" | "aprovacoes" | "observacoes">("pessoais");

  // Escala de trabalho (vigências: a partir de <data>, segue <horário>)
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [horarios, setHorarios] = useState<HorarioOpt[]>([]);
  const [eEscalaData, setEEscalaData] = useState(new Date().toISOString().slice(0, 10));
  const [eEscalaHorarioId, setEEscalaHorarioId] = useState("");
  const [escalaSalvando, setEscalaSalvando] = useState(false);
  const [escalaErro, setEscalaErro] = useState("");
  const [escalaAviso, setEscalaAviso] = useState("");

  // Compartilhar uma vigência com outros colaboradores (aplicação em lote)
  const [shareOpen, setShareOpen] = useState(false);
  const [shareData, setShareData] = useState("");
  const [shareHorarioId, setShareHorarioId] = useState("");
  const [shareBusca, setShareBusca] = useState("");
  const [shareSel, setShareSel] = useState<Set<string>>(new Set());
  const [shareColabs, setShareColabs] = useState<{ id: string; nome: string; setor: { nome: string } | null }[]>([]);
  const [shareSaving, setShareSaving] = useState(false);
  const [shareErro, setShareErro] = useState("");

  // Histórico de diárias do colaborador (folhas de diaristas)
  const [diarias, setDiarias] = useState<Diaria[]>([]);
  const [diariasTotal, setDiariasTotal] = useState(0);

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [editError, setEditError] = useState("");

  // Edit fields
  const [eNome,         setENome]         = useState("");
  const [eCpf,          setECpf]          = useState("");
  const [eRg,           setERg]           = useState("");
  const [eEmail,        setEEmail]        = useState("");
  const [eTelefone,        setETelefone]        = useState("");
  const [eTelegramChatId,  setETelegramChatId]  = useState("");
  const [eCargo,        setECargo]        = useState("");
  const [eSetorId,      setESetorId]      = useState("");
  const [eClassificacaoCusto, setEClassificacaoCusto] = useState("");
  const [eTipoColaborador, setETipoColaborador] = useState("FUNCIONARIO");
  const [eMatricula, setEMatricula] = useState("");
  const [eValorDiaria, setEValorDiaria] = useState("");
  const [eDataAdmissao, setEDataAdmissao] = useState("");
  const [eDataDemissao, setEDataDemissao] = useState("");
  const [eFilialIds,    setEFilialIds]    = useState<string[]>([]);
  const [eEmpresaIds,   setEEmpresaIds]   = useState<string[]>([]);
  const [eUsuarioId,    setEUsuarioId]    = useState("");
  const [eAtivo,        setEAtivo]        = useState(true);
  const [eObservacoes,  setEObservacoes]  = useState("");
  const [eAreasOperacao, setEAreasOperacao] = useState<string[]>([]);
  const [areasDisponiveis, setAreasDisponiveis] = useState<string[]>([]);

  // Options
  const [filiais,  setFiliais]  = useState<Filial[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [setores,  setSetores]  = useState<SetorOpt[]>([]);

  // Delete
  const [showDelete,    setShowDelete]    = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError,   setDeleteError]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch(`/api/empresa/colaboradores/${id}`);
    if (!res.ok) { setError("Colaborador não encontrado"); setLoading(false); return; }
    const json = await res.json();
    setColaborador(json);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch(`/api/empresa/colaboradores/${id}/diarias`)
      .then((r) => r.json())
      .then((j) => { setDiarias(Array.isArray(j.data) ? j.data : []); setDiariasTotal(j.total ?? 0); })
      .catch(() => setDiarias([]));
    fetch(`/api/empresa/colaboradores/${id}/escalas`)
      .then((r) => r.json())
      .then((j) => setEscalas(Array.isArray(j.data) ? j.data : []))
      .catch(() => setEscalas([]));
    fetch("/api/rh/horarios")
      .then((r) => r.json())
      .then((j) => setHorarios(Array.isArray(j.data) ? j.data : []))
      .catch(() => setHorarios([]));
  }, [id]);

  async function adicionarEscala() {
    if (!eEscalaHorarioId) { setEscalaErro("Escolha o horário de trabalho."); return; }
    setEscalaSalvando(true); setEscalaErro("");
    try {
      const res = await fetch(`/api/empresa/colaboradores/${id}/escalas`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horarioId: eEscalaHorarioId, data: eEscalaData }),
      });
      const j = await res.json();
      if (!res.ok) { setEscalaErro(j.error || "Erro ao adicionar"); return; }
      setEscalas((prev) => [j.data, ...prev].sort((a, b) => b.data.localeCompare(a.data)));
      setEEscalaHorarioId("");
    } finally { setEscalaSalvando(false); }
  }

  async function removerEscala(escalaId: string) {
    await fetch(`/api/empresa/colaboradores/${id}/escalas?escalaId=${escalaId}`, { method: "DELETE" });
    setEscalas((prev) => prev.filter((e) => e.id !== escalaId));
  }

  // Abre o popup para aplicar a vigência (horário + data) a outros colaboradores.
  function abrirCompartilhar(e: Escala) {
    setShareData(e.data.slice(0, 10));
    setShareHorarioId(e.horario.id);
    setShareSel(new Set()); setShareBusca(""); setShareErro(""); setEscalaAviso("");
    setShareOpen(true);
    if (shareColabs.length === 0) {
      fetch("/api/empresa/colaboradores?ativo=true")
        .then((r) => r.json())
        .then((j) => setShareColabs(Array.isArray(j) ? j : (j.data ?? [])))
        .catch(() => setShareColabs([]));
    }
  }

  async function compartilharEscala() {
    if (shareSel.size === 0) { setShareErro("Selecione ao menos um colaborador."); return; }
    setShareSaving(true); setShareErro("");
    try {
      const res = await fetch("/api/empresa/colaboradores/escalas-lote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horarioId: shareHorarioId, data: shareData, colaboradorIds: Array.from(shareSel) }),
      });
      const j = await res.json();
      if (!res.ok) { setShareErro(j.error || "Erro ao compartilhar"); return; }
      setShareOpen(false);
      setEscalaAviso(`Escala aplicada a ${j.data.criadas} colaborador(es)${j.data.puladas ? ` (${j.data.puladas} já tinham essa vigência)` : ""}.`);
    } finally { setShareSaving(false); }
  }

  useEffect(() => {
    if (colaborador) {
      document.title = colaborador.nome + " — ERP";
    }
    return () => { document.title = "ERP"; };
  }, [colaborador]);

  function enterEdit() {
    if (!colaborador) return;
    setENome(colaborador.nome);
    setECpf(colaborador.cpf ?? "");
    setERg(colaborador.rg ?? "");
    setEEmail(colaborador.email ?? "");
    setETelefone(colaborador.telefone ?? "");
    setETelegramChatId(colaborador.telegramChatId ?? "");
    setECargo(colaborador.cargo ?? "");
    setESetorId(colaborador.setorId ?? "");
    setEClassificacaoCusto(colaborador.classificacaoCusto ?? "");
    setETipoColaborador(colaborador.tipoColaborador ?? "FUNCIONARIO");
    setEMatricula(colaborador.matricula ?? "");
    setEValorDiaria(colaborador.valorHora != null ? String(Number(colaborador.valorHora)).replace(".", ",") : "");
    setEDataAdmissao(colaborador.dataAdmissao ? colaborador.dataAdmissao.slice(0, 10) : "");
    setEDataDemissao(colaborador.dataDemissao ? colaborador.dataDemissao.slice(0, 10) : "");
    setEFilialIds(colaborador.filiais.map((f) => f.id));
    setEEmpresaIds((colaborador.empresas ?? []).map((e) => e.id));
    setEUsuarioId(colaborador.usuarioId ?? "");
    setEAtivo(colaborador.ativo);
    setEObservacoes(colaborador.observacoes ?? "");
    setEAreasOperacao(colaborador.areasOperacao ?? []);
    setEditError("");
    setEditMode(true);
    fetch("/api/pcp/areas-operacao").then((r) => r.json()).then((j) => setAreasDisponiveis(Array.isArray(j.data) ? j.data : [])).catch(() => setAreasDisponiveis([]));

    // Load options
    fetch("/api/empresa/filiais?ativo=true")
      .then((r) => r.json())
      .then((j) => setFiliais(Array.isArray(j) ? j : []));
    fetch("/api/configuracoes/usuarios")
      .then((r) => r.json())
      .then((j) => {
        const list: Usuario[] = Array.isArray(j) ? j : (j.data ?? []);
        setUsuarios(list);
      });
    fetch("/api/empresas")
      .then((r) => r.json())
      .then((j) => setEmpresas(Array.isArray(j) ? j : (j.data ?? [])));
    fetch("/api/empresa/setores")
      .then((r) => r.json())
      .then((j) => setSetores(Array.isArray(j) ? j : []));
  }

  async function saveEdit() {
    if (!eNome.trim())  { setEditError("Nome é obrigatório"); setTab("pessoais"); return; }
    if (!eSetorId)      { setEditError("Setor é obrigatório"); setTab("funcionais"); return; }
    setSaving(true); setEditError("");
    try {
      const res = await fetch(`/api/empresa/colaboradores/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome:         eNome.trim(),
          cpf:          eCpf.trim()  || null,
          rg:           eRg.trim()   || null,
          email:        eEmail.trim() || null,
          telefone:       eTelefone.trim() || null,
          telegramChatId: eTelegramChatId.trim() || null,
          cargo:          eCargo.trim()   || null,
          classificacaoCusto: eClassificacaoCusto || null,
          tipoColaborador: eTipoColaborador,
          matricula:      eMatricula.trim() || null,
          valorHora:    eValorDiaria.trim() ? parseFloat(eValorDiaria.replace(/\./g, "").replace(",", ".")) || null : null,
          setorId:      eSetorId       || null,
          dataAdmissao: eDataAdmissao || null,
          dataDemissao: eDataDemissao || null,
          filialIds:    eFilialIds,
          empresaIds:   eEmpresaIds,
          usuarioId:    eUsuarioId   || null,
          ativo:        eAtivo,
          observacoes:  eObservacoes.trim() || null,
          areasOperacao: eAreasOperacao,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setEditError(json.error || "Erro ao salvar"); return; }
      setColaborador(json);
      setEditMode(false);
    } catch {
      setEditError("Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    setDeleteLoading(true); setDeleteError("");
    try {
      const res = await fetch(`/api/empresa/colaboradores/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        setDeleteError(json.error || "Não foi possível excluir");
        return;
      }
      router.push("/empresa/colaboradores");
    } catch {
      setDeleteError("Erro de conexão");
    } finally {
      setDeleteLoading(false);
    }
  }

  if (loading) return (
    <div className="px-8 pt-8 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin inline mr-2" />Carregando...
    </div>
  );

  if (error || !colaborador) return (
    <div className="px-8 pt-8 text-red-500">{error || "Não encontrado"}</div>
  );

  const TABS = [
    { key: "pessoais",    label: "Dados Pessoais" },
    { key: "funcionais",  label: "Dados Funcionais" },
    { key: "escala",      label: `Escala de Trabalho (${escalas.length})` },
    { key: "diarias",     label: `Diárias (${diarias.length})` },
    { key: "aprovacoes",  label: `Aprovações (${colaborador.etapasAprovacao?.length ?? 0})` },
    { key: "observacoes", label: "Observações" },
  ] as const;

  return (
    <div>
      <PageHeader
        title={editMode ? `Editar — ${colaborador.nome}` : colaborador.nome}
        breadcrumbs={[
          { label: "Empresa" },
          { label: "Colaboradores", href: "/empresa/colaboradores" },
          { label: colaborador.nome },
        ]}
        action={
          <div className="flex gap-2">
            {editMode ? (
              <>
                <Button variant="outline" onClick={() => { setEditMode(false); setEditError(""); }} disabled={saving}>
                  <X className="w-4 h-4 mr-1" /> Cancelar
                </Button>
                <Button onClick={saveEdit} disabled={saving || !eNome.trim() || !eSetorId}>
                  {saving ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-1" />Salvando...</>
                  ) : (
                    <><Save className="w-4 h-4 mr-1" />Salvar</>
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={enterEdit}>
                  <Pencil className="w-4 h-4 mr-1" /> Editar
                </Button>
                <Button
                  variant="outline"
                  className="border-danger/30 text-danger hover:bg-danger/10"
                  onClick={() => { setShowDelete(true); setDeleteError(""); }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="px-8 pb-8 max-w-4xl space-y-5">
        {/* Status badges */}
        {!editMode && (
          <div className="flex items-center gap-3">
            <span className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium",
              colaborador.ativo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
            )}>
              <UserCheck className="w-4 h-4" />
              {colaborador.ativo ? "Ativo" : "Inativo"}
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-muted text-muted-foreground">
              {colaborador.tipoColaborador === "PRESTADOR" ? "Prestador" : "Funcionário"}
            </span>
            {colaborador.usuario && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-info/15 text-info">
                Usuário: {colaborador.usuario.nome}
              </span>
            )}
          </div>
        )}

        {editError && (
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm">
            {editError}
          </div>
        )}

        {/* Abas (padrão do cadastro de produtos) */}
        <div className="border-b border-border">
          <div className="flex gap-0">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                  tab === t.key
                    ? "border-blue-600 text-info"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Aba: Dados Pessoais */}
        {tab === "pessoais" && (
          <Card>
            <CardContent className={cn("pt-6", editMode ? "space-y-4" : "grid grid-cols-2 gap-4")}>
              {editMode ? (
                <>
                  <Field label="Nome" required>
                    <Input value={eNome} onChange={(e) => setENome(e.target.value)} autoFocus />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="CPF">
                      <Input value={eCpf} onChange={(e) => setECpf(e.target.value)} placeholder="000.000.000-00" />
                    </Field>
                    <Field label="RG">
                      <Input value={eRg} onChange={(e) => setERg(e.target.value)} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="E-mail">
                      <Input type="email" value={eEmail} onChange={(e) => setEEmail(e.target.value)} />
                    </Field>
                    <Field label="Telefone (WhatsApp)" hint="Usado nos fluxos de aprovação via WhatsApp">
                      <Input value={eTelefone} onChange={(e) => setETelefone(e.target.value)} placeholder="(00) 00000-0000" />
                    </Field>
                  </div>
                  <Field
                    label="Telegram Chat ID"
                    hint="Para receber aprovações no Telegram, informe seu Chat ID. Envie /start para o bot e depois use @userinfobot para descobrir seu ID."
                  >
                    <Input
                      value={eTelegramChatId}
                      onChange={(e) => setETelegramChatId(e.target.value)}
                      placeholder="Ex: 123456789"
                    />
                  </Field>
                </>
              ) : (
                <>
                  <div className="col-span-2">
                    <InfoField label="Nome">{colaborador.nome}</InfoField>
                  </div>
                  <InfoField label="CPF">{colaborador.cpf}</InfoField>
                  <InfoField label="RG">{colaborador.rg}</InfoField>
                  <InfoField label="E-mail">{colaborador.email}</InfoField>
                  <InfoField label="Telefone (WhatsApp)">
                    {colaborador.telefone ? (
                      <span className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-emerald-500" />
                        {colaborador.telefone}
                      </span>
                    ) : null}
                  </InfoField>
                  <InfoField label="Telegram Chat ID">
                    {colaborador.telegramChatId ?? null}
                  </InfoField>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Aba: Dados Funcionais */}
        {tab === "funcionais" && (
          <Card>
            <CardContent className={cn("pt-6", editMode ? "space-y-4" : "grid grid-cols-2 gap-4")}>
              {editMode ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Cargo">
                      <Input value={eCargo} onChange={(e) => setECargo(e.target.value)} />
                    </Field>
                    <Field label="Setor" required>
                      <ComboboxWithCreate
                        value={eSetorId}
                        onChange={(v) => setESetorId(v)}
                        placeholder="Selecione o setor"
                        noneLabel="Selecione o setor"
                        triggerClassName="h-9 rounded-lg"
                        options={setores.filter((s) => s.ativo).map((s) => ({ value: s.id, label: s.nome }))}
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Tipo de vínculo">
                      <select
                        value={eTipoColaborador}
                        onChange={(e) => setETipoColaborador(e.target.value)}
                        className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm"
                      >
                        <option value="FUNCIONARIO">Funcionário — folha de pagamento</option>
                        <option value="PRESTADOR">Prestador — lançamento de diaristas</option>
                      </select>
                    </Field>
                    <Field label="Classificação de custo (folha)">
                      <select
                        value={eClassificacaoCusto}
                        onChange={(e) => setEClassificacaoCusto(e.target.value)}
                        className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm"
                      >
                        <option value="">— não classificado —</option>
                        <option value="MOD">MOD — Mão de obra direta</option>
                        <option value="MOI">MOI — Mão de obra indireta</option>
                        <option value="ADMIN">Administrativo / Comercial</option>
                      </select>
                    </Field>
                    <Field label="Matrícula (folha)">
                      <Input value={eMatricula} onChange={(e) => setEMatricula(e.target.value)} placeholder="Ex: 010543" />
                    </Field>
                    <Field label="Valor da hora (R$)" hint="Puxado no lançamento de diárias (pode ser alterado lá)">
                      <Input value={eValorDiaria} onChange={(e) => setEValorDiaria(e.target.value)} inputMode="decimal" placeholder="Ex: 10,00" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Data de Admissão">
                      <DatePicker value={eDataAdmissao} onChange={(v) => setEDataAdmissao(v)} className="w-full" />
                    </Field>
                    <Field label="Data de Demissão">
                      <DatePicker value={eDataDemissao} onChange={(v) => setEDataDemissao(v)} className="w-full" />
                    </Field>
                  </div>
                  <Field label="Filial">
                    <div className="space-y-1.5 max-h-40 overflow-y-auto border border-border rounded-lg p-2">
                      {filiais.length === 0 && (
                        <p className="text-xs text-muted-foreground px-1">Nenhuma filial ativa</p>
                      )}
                      {filiais.map((f) => (
                        <label key={f.id} className="flex items-center gap-2 px-1 py-0.5 cursor-pointer hover:bg-muted rounded">
                          <input
                            type="checkbox"
                            checked={eFilialIds.includes(f.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEFilialIds((prev) => [...prev, f.id]);
                              } else {
                                setEFilialIds((prev) => prev.filter((x) => x !== f.id));
                              }
                            }}
                            className="rounded"
                          />
                          <span className="text-sm">{f.nomeFantasia || f.razaoSocial}</span>
                        </label>
                      ))}
                    </div>
                  </Field>
                  <Field label="Empresas" hint="Onde o colaborador aparece nos lançamentos e tem conta (Salários a Pagar)">
                    <div className="space-y-1.5 max-h-40 overflow-y-auto border border-border rounded-lg p-2">
                      {empresas.length === 0 && (
                        <p className="text-xs text-muted-foreground px-1">Nenhuma empresa</p>
                      )}
                      {empresas.map((e) => (
                        <label key={e.id} className="flex items-center gap-2 px-1 py-0.5 cursor-pointer hover:bg-muted rounded">
                          <input
                            type="checkbox"
                            checked={eEmpresaIds.includes(e.id)}
                            onChange={(ev) => setEEmpresaIds((prev) => ev.target.checked ? [...prev, e.id] : prev.filter((x) => x !== e.id))}
                            className="rounded"
                          />
                          <span className="text-sm">{e.nomeFantasia || e.razaoSocial}</span>
                        </label>
                      ))}
                    </div>
                  </Field>
                  <Field label="Usuário do sistema" hint="Opcional — vincule ao usuário de login">
                    <ComboboxWithCreate
                      value={eUsuarioId}
                      onChange={(v) => setEUsuarioId(v)}
                      noneLabel="Nenhum / Sem vínculo"
                      triggerClassName="h-9 rounded-lg"
                      options={usuarios.map((u) => ({ value: u.id, label: `${u.nome} — ${u.email}` }))}
                    />
                  </Field>
                  <Field label="Áreas de operação" hint="Em quais etapas do fluxo o colaborador pode atuar (filtra o responsável nas OPs). Vazio = não aparece como responsável em nenhuma etapa.">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 border border-border rounded-lg p-2 max-h-40 overflow-y-auto">
                      {areasDisponiveis.length === 0 && (
                        <p className="text-xs text-muted-foreground px-1 col-span-full">Nenhuma área (publique um fluxo de produção).</p>
                      )}
                      {areasDisponiveis.map((a) => (
                        <label key={a} className="flex items-center gap-2 px-1 py-0.5 cursor-pointer hover:bg-muted rounded">
                          <input
                            type="checkbox"
                            checked={eAreasOperacao.includes(a)}
                            onChange={(ev) => setEAreasOperacao((prev) => ev.target.checked ? [...prev, a] : prev.filter((x) => x !== a))}
                            className="rounded"
                          />
                          <span className="text-sm">{a}</span>
                        </label>
                      ))}
                    </div>
                  </Field>
                  <div className="flex items-center gap-3 pt-1">
                    <input
                      id="e-ativo"
                      type="checkbox"
                      checked={eAtivo}
                      onChange={(e) => setEAtivo(e.target.checked)}
                      className="rounded"
                    />
                    <Label htmlFor="e-ativo" className="cursor-pointer">Colaborador ativo</Label>
                  </div>
                </>
              ) : (
                <>
                  <InfoField label="Cargo">{colaborador.cargo}</InfoField>
                  <InfoField label="Setor">{colaborador.setor?.nome}</InfoField>
                  <InfoField label="Tipo de vínculo">
                    {colaborador.tipoColaborador === "PRESTADOR" ? "Prestador — lançamento de diaristas" : "Funcionário — folha de pagamento"}
                  </InfoField>
                  <InfoField label="Classificação de custo (folha)">
                    {colaborador.classificacaoCusto ? CLASSIF_LABEL[colaborador.classificacaoCusto] : null}
                  </InfoField>
                  <InfoField label="Matrícula (folha)">{colaborador.matricula}</InfoField>
                  <InfoField label="Valor da hora">
                    {colaborador.valorHora != null ? formatBRL(Number(colaborador.valorHora)) : null}
                  </InfoField>
                  <InfoField label="Data de Admissão">
                    {colaborador.dataAdmissao ? formatDate(colaborador.dataAdmissao) : null}
                  </InfoField>
                  <InfoField label="Data de Demissão">
                    {colaborador.dataDemissao ? formatDate(colaborador.dataDemissao) : null}
                  </InfoField>
                  <InfoField label="Filial">
                    {colaborador.filiais.length > 0
                      ? colaborador.filiais.map((f) => f.nomeFantasia || f.razaoSocial).join(", ")
                      : null
                    }
                  </InfoField>
                  <InfoField label="Empresas">
                    {(colaborador.empresas ?? []).length > 0
                      ? colaborador.empresas.map((e) => e.nomeFantasia || e.razaoSocial).join(", ")
                      : null
                    }
                  </InfoField>
                  <InfoField label="Áreas de operação">
                    {colaborador.areasOperacao?.length ? colaborador.areasOperacao.join(", ") : "Nenhuma"}
                  </InfoField>
                  <InfoField label="Usuário do sistema">
                    {colaborador.usuario ? (
                      <Link
                        href={`/admin/usuarios`}
                        className="text-info hover:underline"
                      >
                        {colaborador.usuario.nome} ({colaborador.usuario.email})
                      </Link>
                    ) : null}
                  </InfoField>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Aba: Escala de trabalho (a partir de <data> segue <horário>) */}
        {tab === "escala" && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">A partir de</p>
                  <DatePicker value={eEscalaData} onChange={(v) => setEEscalaData(v)} className="w-44" />
                </div>
                <div className="flex-1 min-w-[240px]">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Horário de trabalho</p>
                  <ComboboxWithCreate
                    value={eEscalaHorarioId}
                    onChange={(v) => setEEscalaHorarioId(v)}
                    placeholder="Escolher horário..."
                    noneLabel="— selecionar —"
                    menuMinWidth={320}
                    triggerClassName="h-9 rounded-lg"
                    options={horarios.filter((h) => h.ativo).map((h) => ({
                      value: h.id,
                      label: `${h.nome} — ${h.faixas.map((f) => `[${f.horaInicial} - ${f.horaFinal}]`).join(" ")}`,
                    }))}
                  />
                </div>
                <Button onClick={adicionarEscala} disabled={escalaSalvando}>
                  {escalaSalvando ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Pencil className="w-4 h-4 mr-1.5 hidden" />}
                  Adicionar
                </Button>
              </div>
              {escalaErro && <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{escalaErro}</p>}
              {escalaAviso && <p className="text-sm text-success bg-success/10 border border-success/30 rounded-lg px-3 py-2">{escalaAviso}</p>}
              {horarios.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum horário cadastrado — crie em Gestão de Pessoas → Horários de Trabalho.</p>
              )}

              {escalas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma escala definida para este colaborador.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                    <tr>
                      <th className="text-left py-2 pr-4 font-semibold">A partir de</th>
                      <th className="text-left py-2 pr-4 font-semibold">Horário</th>
                      <th className="text-left py-2 pr-4 font-semibold">Faixas</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {escalas.map((e, i) => (
                      <tr key={e.id} className={cn(i === 0 && "bg-success/5")}>
                        <td className="py-2.5 pr-4 font-medium text-foreground whitespace-nowrap">
                          {new Date(`${e.data.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR")}
                          {i === 0 && <span className="ml-2 text-[10px] font-semibold uppercase text-success">vigente</span>}
                        </td>
                        <td className="py-2.5 pr-4">{e.horario.nome}</td>
                        <td className="py-2.5 pr-4 text-muted-foreground tabular-nums">
                          {e.horario.faixas.map((f) => `[${f.horaInicial} - ${f.horaFinal}]`).join(" ")}
                        </td>
                        <td className="py-2.5 text-right whitespace-nowrap">
                          <button onClick={() => abrirCompartilhar(e)} className="text-muted-foreground hover:text-info mr-2" title="Compartilhar esta escala com outros colaboradores">
                            <Share2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => removerEscala(e.id)} className="text-muted-foreground hover:text-danger" title="Remover">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        )}

        {/* Aba: Histórico de diárias */}
        {tab === "diarias" && (
          <Card>
            <CardContent className="pt-6">
              {diarias.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma diária lançada para este colaborador.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                      <tr>
                        <th className="text-left py-2 pr-4 font-semibold">Data</th>
                        <th className="text-left py-2 pr-4 font-semibold">Setor</th>
                        <th className="text-left py-2 pr-4 font-semibold">Turno</th>
                        <th className="text-left py-2 pr-4 font-semibold">Serviço</th>
                        <th className="text-right py-2 pr-4 font-semibold">Valor</th>
                        <th className="text-center py-2 font-semibold">Folha</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {diarias.map((d) => (
                        <tr
                          key={d.id}
                          onClick={() => router.push(`/rh/diaristas/${d.folhaId}`)}
                          className="hover:bg-muted cursor-pointer"
                          title="Abrir a folha de diárias"
                        >
                          <td className="py-2.5 pr-4 font-medium text-foreground whitespace-nowrap">
                            {new Date(`${d.data.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR")}
                          </td>
                          <td className="py-2.5 pr-4">{d.setor || <span className="text-muted-foreground/60">—</span>}</td>
                          <td className="py-2.5 pr-4">{d.turno === "NOITE" ? "Noite" : "Dia"}</td>
                          <td className="py-2.5 pr-4">{d.servico || <span className="text-muted-foreground/60">—</span>}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums">{formatBRL(d.valor)}</td>
                          <td className="py-2.5 text-center">
                            <span className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold",
                              d.status === "FECHADA" ? "bg-success/15 text-success" : "bg-info/15 text-info",
                            )}>
                              {d.status === "FECHADA" ? "Fechada" : "Aberta"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border">
                        <td colSpan={4} className="py-2.5 pr-4 text-right text-xs text-muted-foreground uppercase">
                          Total ({diarias.length} diária{diarias.length !== 1 ? "s" : ""})
                        </td>
                        <td className="py-2.5 pr-4 text-right font-bold tabular-nums">{formatBRL(diariasTotal)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Aba: Aprovações */}
        {tab === "aprovacoes" && (
          <Card>
            <CardContent className="pt-6 space-y-2">
              {(colaborador.etapasAprovacao?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">Este colaborador não participa de nenhuma etapa de aprovação.</p>
              ) : (
                (colaborador.etapasAprovacao ?? []).map((e) => (
                  <div key={e.id} className="flex items-center gap-3 bg-muted rounded-lg px-4 py-3 text-sm">
                    <span className="font-mono text-xs font-bold text-info w-6 text-center">{e.ordem}</span>
                    <div>
                      <p className="font-medium text-foreground">{e.nome ?? `Etapa ${e.ordem}`}</p>
                      <p className="text-xs text-muted-foreground">Fluxo: {e.fluxo.nome}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}

        {/* Aba: Observações */}
        {tab === "observacoes" && (
          <Card>
            <CardContent className="pt-6">
              {editMode ? (
                <Textarea value={eObservacoes} onChange={(e) => setEObservacoes(e.target.value)} rows={4} placeholder="Informações adicionais..." />
              ) : colaborador.observacoes ? (
                <p className="text-sm text-foreground whitespace-pre-wrap">{colaborador.observacoes}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Sem observações.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Meta */}
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Criado em: {formatDate(colaborador.createdAt)}</p>
          <p>Atualizado em: {formatDate(colaborador.updatedAt)}</p>
        </div>
      </div>

      {/* Compartilhar escala com outros colaboradores */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Compartilhar escala</DialogTitle>
            <DialogDescription>
              Aplica {horarios.find((h) => h.id === shareHorarioId)?.nome ?? "o horário"} a partir de{" "}
              {shareData ? new Date(`${shareData}T12:00:00`).toLocaleDateString("pt-BR") : "—"} aos colaboradores selecionados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">A partir de</p>
              <DatePicker value={shareData} onChange={(v) => setShareData(v)} className="w-44" />
            </div>

            {shareErro && <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{shareErro}</p>}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={shareBusca}
                onChange={(e) => setShareBusca(e.target.value)}
                placeholder="Buscar por nome ou setor..."
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>

            <div className="border border-border rounded-lg max-h-64 overflow-y-auto divide-y divide-border">
              {shareColabs.length === 0 ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : (
                shareColabs
                  .filter((c) => c.id !== id)
                  .filter((c) => {
                    const q = shareBusca.trim().toLowerCase();
                    return !q || c.nome.toLowerCase().includes(q) || (c.setor?.nome ?? "").toLowerCase().includes(q);
                  })
                  .map((c) => (
                    <label key={c.id} className={cn("flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted", shareSel.has(c.id) && "bg-info/5")}>
                      <input
                        type="checkbox"
                        checked={shareSel.has(c.id)}
                        onChange={() => setShareSel((prev) => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}
                        className="w-4 h-4 rounded border-border"
                      />
                      <span className="text-sm font-medium text-foreground flex-1 min-w-0 truncate">{c.nome}</span>
                      {c.setor?.nome && <span className="text-xs text-muted-foreground shrink-0">{c.setor.nome}</span>}
                    </label>
                  ))
              )}
            </div>
            <p className="text-xs text-muted-foreground">{shareSel.size} selecionado{shareSel.size !== 1 ? "s" : ""}</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShareOpen(false)} disabled={shareSaving}>Cancelar</Button>
            <Button onClick={compartilharEscala} disabled={shareSaving || shareSel.size === 0}>
              {shareSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Share2 className="w-4 h-4 mr-2" />}
              Aplicar{shareSel.size > 0 ? ` (${shareSel.size})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete modal */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-danger/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-danger" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Excluir colaborador?</p>
                <p className="text-sm text-muted-foreground mt-0.5">{colaborador.nome}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Esta ação é permanente e não pode ser desfeita.</p>
            {deleteError && (
              <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 mb-4">
                {deleteError}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowDelete(false)} disabled={deleteLoading}>
                Cancelar
              </Button>
              <Button variant="destructive" size="sm" onClick={confirmDelete} disabled={deleteLoading}>
                {deleteLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-1" />Excluindo...</>
                ) : (
                  <><Trash2 className="w-4 h-4 mr-1" />Excluir</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
