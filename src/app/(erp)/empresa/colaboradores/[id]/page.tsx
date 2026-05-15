"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatDate } from "@/lib/utils";
import {
  Pencil, Trash2, Loader2, AlertTriangle, Save, X, Phone, UserCheck,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Filial   = { id: string; razaoSocial: string; nomeFantasia: string | null };
type Usuario  = { id: string; nome: string; email: string };
type EtapaInfo = { id: string; ordem: number; nome: string | null; fluxo: { id: string; nome: string } };

type Colaborador = {
  id:              string;
  nome:            string;
  cpf:             string | null;
  rg:              string | null;
  email:           string | null;
  telefone:        string | null;
  cargo:           string | null;
  departamento:    string | null;
  dataAdmissao:    string | null;
  dataDemissao:    string | null;
  filiais:         Filial[];
  usuarioId:       string | null;
  usuario:         Usuario | null;
  ativo:           boolean;
  observacoes:     string | null;
  createdAt:       string;
  updatedAt:       string;
  etapasAprovacao: EtapaInfo[];
};

// ── Field helpers ─────────────────────────────────────────────────────────────

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 mb-0.5">{label}</p>
      <div className="text-sm text-gray-800">{children ?? <span className="text-gray-300">—</span>}</div>
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
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ColaboradorDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [colaborador, setColaborador] = useState<Colaborador | null>(null);
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
  const [eTelefone,     setETelefone]     = useState("");
  const [eCargo,        setECargo]        = useState("");
  const [eDepartamento, setEDepartamento] = useState("");
  const [eDataAdmissao, setEDataAdmissao] = useState("");
  const [eDataDemissao, setEDataDemissao] = useState("");
  const [eFilialIds,    setEFilialIds]    = useState<string[]>([]);
  const [eUsuarioId,    setEUsuarioId]    = useState("");
  const [eAtivo,        setEAtivo]        = useState(true);
  const [eObservacoes,  setEObservacoes]  = useState("");

  // Options
  const [filiais,  setFiliais]  = useState<Filial[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);

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
    setECargo(colaborador.cargo ?? "");
    setEDepartamento(colaborador.departamento ?? "");
    setEDataAdmissao(colaborador.dataAdmissao ? colaborador.dataAdmissao.slice(0, 10) : "");
    setEDataDemissao(colaborador.dataDemissao ? colaborador.dataDemissao.slice(0, 10) : "");
    setEFilialIds(colaborador.filiais.map((f) => f.id));
    setEUsuarioId(colaborador.usuarioId ?? "");
    setEAtivo(colaborador.ativo);
    setEObservacoes(colaborador.observacoes ?? "");
    setEditError("");
    setEditMode(true);

    // Load options
    fetch("/api/empresa/filiais?ativo=true")
      .then((r) => r.json())
      .then((j) => setFiliais(Array.isArray(j) ? j : []));
    fetch("/api/configuracoes/usuarios")
      .then((r) => r.json())
      .then((j) => {
        const list: Usuario[] = Array.isArray(j) ? j : (j.data ?? []);
        // Include current usuario even if already linked elsewhere
        setUsuarios(list);
      });
  }

  async function saveEdit() {
    if (!eNome.trim()) { setEditError("Nome é obrigatório"); return; }
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
          telefone:     eTelefone.trim() || null,
          cargo:        eCargo.trim()   || null,
          departamento: eDepartamento.trim() || null,
          dataAdmissao: eDataAdmissao || null,
          dataDemissao: eDataDemissao || null,
          filialIds:    eFilialIds,
          usuarioId:    eUsuarioId   || null,
          ativo:        eAtivo,
          observacoes:  eObservacoes.trim() || null,
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
      window.location.href = "/empresa/colaboradores";
    } catch {
      setDeleteError("Erro de conexão");
    } finally {
      setDeleteLoading(false);
    }
  }

  if (loading) return (
    <div className="px-8 pt-8 text-gray-400">
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
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Dados Funcionais</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Cargo">
                  <Input value={eCargo} onChange={(e) => setECargo(e.target.value)} />
                </Field>
                <Field label="Departamento">
                  <Input value={eDepartamento} onChange={(e) => setEDepartamento(e.target.value)} />
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
                <div className="space-y-1.5 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2">
                  {filiais.length === 0 && (
                    <p className="text-xs text-gray-400 px-1">Nenhuma filial ativa</p>
                  )}
                  {filiais.map((f) => (
                    <label key={f.id} className="flex items-center gap-2 px-1 py-0.5 cursor-pointer hover:bg-gray-50 rounded">
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
              <Field label="Usuário do sistema" hint="Opcional — vincule ao usuário de login">
                <select
                  value={eUsuarioId}
                  onChange={(e) => setEUsuarioId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <option value="">Nenhum / Sem vínculo</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>{u.nome} — {u.email}</option>
                  ))}
                </select>
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
            <Button onClick={saveEdit} disabled={saving || !eNome.trim()}>
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
              className="border-red-200 text-red-600 hover:bg-red-50"
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
            colaborador.ativo ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
          )}>
            <UserCheck className="w-4 h-4" />
            {colaborador.ativo ? "Ativo" : "Inativo"}
          </span>
          {colaborador.usuario && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-700">
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
          </CardContent>
        </Card>

        {/* Dados funcionais */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Dados Funcionais</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <InfoField label="Cargo">{colaborador.cargo}</InfoField>
            <InfoField label="Departamento">{colaborador.departamento}</InfoField>
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
            <InfoField label="Usuário do sistema">
              {colaborador.usuario ? (
                <Link
                  href={`/admin/usuarios`}
                  className="text-blue-600 hover:underline"
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
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{colaborador.observacoes}</p>
            </CardContent>
          </Card>
        )}

        {/* Fluxos de aprovação */}
        {colaborador.etapasAprovacao.length > 0 && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Etapas de Aprovação</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {colaborador.etapasAprovacao.map((e) => (
                <div key={e.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3 text-sm">
                  <span className="font-mono text-xs font-bold text-blue-600 w-6 text-center">{e.ordem}</span>
                  <div>
                    <p className="font-medium text-gray-900">{e.nome ?? `Etapa ${e.ordem}`}</p>
                    <p className="text-xs text-gray-500">Fluxo: {e.fluxo.nome}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Meta */}
        <div className="text-xs text-gray-400 space-y-0.5">
          <p>Criado em: {formatDate(colaborador.createdAt)}</p>
          <p>Atualizado em: {formatDate(colaborador.updatedAt)}</p>
        </div>
      </div>

      {/* Delete modal */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Excluir colaborador?</p>
                <p className="text-sm text-gray-500 mt-0.5">{colaborador.nome}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">Esta ação é permanente e não pode ser desfeita.</p>
            {deleteError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
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
