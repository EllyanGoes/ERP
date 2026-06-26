"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatDate } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";
import {
  Pencil, Trash2, Loader2, AlertTriangle, Save, X, Phone, UserCheck,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Filial    = { id: string; razaoSocial: string; nomeFantasia: string | null };
type Empresa   = { id: string; razaoSocial: string; nomeFantasia: string | null };
type Usuario   = { id: string; nome: string; email: string };
type SetorOpt  = { id: string; nome: string; ativo: boolean };
type EtapaInfo = { id: string; ordem: number; nome: string | null; fluxo: { id: string; nome: string } };

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
    if (!eNome.trim())  { setEditError("Nome é obrigatório"); return; }
    if (!eSetorId)      { setEditError("Setor é obrigatório"); return; }
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

  if (editMode) {
    return (
      <div>
        <PageHeader
          title={`Editar — ${colaborador.nome}`}
          breadcrumbs={[
            { label: "Empresa" },
            { label: "Colaboradores", href: "/empresa/colaboradores" },
            { label: colaborador.nome, href: `/empresa/colaboradores/${id}` },
            { label: "Editar" },
          ]}
        />

        <div className="px-8 pb-8 max-w-3xl space-y-5">
          {editError && (
            <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm">
              {editError}
            </div>
          )}

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Dados Pessoais</CardTitle></CardHeader>
            <CardContent className="space-y-4">
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Dados Funcionais</CardTitle></CardHeader>
            <CardContent className="space-y-4">
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
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Data de Admissão">
                  <Input type="date" value={eDataAdmissao} onChange={(e) => setEDataAdmissao(e.target.value)} />
                </Field>
                <Field label="Data de Demissão">
                  <Input type="date" value={eDataDemissao} onChange={(e) => setEDataDemissao(e.target.value)} />
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
              <Field label="Áreas de operação" hint="Em quais etapas do fluxo o colaborador pode atuar (filtra o responsável nas OPs). Vazio = aparece em todas.">
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Observações</CardTitle></CardHeader>
            <CardContent>
              <Textarea value={eObservacoes} onChange={(e) => setEObservacoes(e.target.value)} rows={4} />
            </CardContent>
          </Card>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setEditMode(false)} disabled={saving}>
              <X className="w-4 h-4 mr-1" /> Cancelar
            </Button>
            <Button onClick={saveEdit} disabled={saving || !eNome.trim() || !eSetorId}>
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-1" />Salvando...</>
              ) : (
                <><Save className="w-4 h-4 mr-1" />Salvar</>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Read view ────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title={colaborador.nome}
        breadcrumbs={[
          { label: "Empresa" },
          { label: "Colaboradores", href: "/empresa/colaboradores" },
          { label: colaborador.nome },
        ]}
        action={
          <div className="flex gap-2">
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
          </div>
        }
      />

      <div className="px-8 pb-8 max-w-3xl space-y-5">
        {/* Status badge */}
        <div className="flex items-center gap-3">
          <span className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium",
            colaborador.ativo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
          )}>
            <UserCheck className="w-4 h-4" />
            {colaborador.ativo ? "Ativo" : "Inativo"}
          </span>
          {colaborador.usuario && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-info/15 text-info">
              Usuário: {colaborador.usuario.nome}
            </span>
          )}
        </div>

        {/* Dados pessoais */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Dados Pessoais</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
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
          </CardContent>
        </Card>

        {/* Dados funcionais */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Dados Funcionais</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <InfoField label="Cargo">{colaborador.cargo}</InfoField>
            <InfoField label="Setor">{colaborador.setor?.nome}</InfoField>
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
            <InfoField label="Áreas de operação">
              {colaborador.areasOperacao?.length ? colaborador.areasOperacao.join(", ") : "Todas"}
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
          </CardContent>
        </Card>

        {/* Observações */}
        {colaborador.observacoes && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Observações</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-foreground whitespace-pre-wrap">{colaborador.observacoes}</p>
            </CardContent>
          </Card>
        )}

        {/* Fluxos de aprovação */}
        {(colaborador.etapasAprovacao?.length ?? 0) > 0 && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Etapas de Aprovação</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(colaborador.etapasAprovacao ?? []).map((e) => (
                <div key={e.id} className="flex items-center gap-3 bg-muted rounded-lg px-4 py-3 text-sm">
                  <span className="font-mono text-xs font-bold text-info w-6 text-center">{e.ordem}</span>
                  <div>
                    <p className="font-medium text-foreground">{e.nome ?? `Etapa ${e.ordem}`}</p>
                    <p className="text-xs text-muted-foreground">Fluxo: {e.fluxo.nome}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Meta */}
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Criado em: {formatDate(colaborador.createdAt)}</p>
          <p>Atualizado em: {formatDate(colaborador.updatedAt)}</p>
        </div>
      </div>

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
