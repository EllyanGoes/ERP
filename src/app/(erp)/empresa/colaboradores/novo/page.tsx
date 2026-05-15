"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save, X } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Filial   = { id: string; razaoSocial: string; nomeFantasia: string | null };
type Usuario  = { id: string; nome: string; email: string };

// ── Field helper ──────────────────────────────────────────────────────────────

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

export default function NovoColaboradorPage() {
  const router = useRouter();

  const [filiais,   setFiliais]   = useState<Filial[]>([]);
  const [usuarios,  setUsuarios]  = useState<Usuario[]>([]);

  const [nome,         setNome]         = useState("");
  const [cpf,          setCpf]          = useState("");
  const [rg,           setRg]           = useState("");
  const [email,        setEmail]        = useState("");
  const [telefone,     setTelefone]     = useState("");
  const [cargo,        setCargo]        = useState("");
  const [departamento, setDepartamento] = useState("");
  const [dataAdmissao, setDataAdmissao] = useState("");
  const [filialId,     setFilialId]     = useState("");
  const [usuarioId,    setUsuarioId]    = useState("");
  const [ativo,        setAtivo]        = useState(true);
  const [observacoes,  setObservacoes]  = useState("");

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  useEffect(() => {
    fetch("/api/empresa/filiais?ativo=true")
      .then((r) => r.json())
      .then((j) => setFiliais(Array.isArray(j) ? j : []));
    // Load users that don't have a colaborador yet
    fetch("/api/configuracoes/usuarios")
      .then((r) => r.json())
      .then((j) => {
        const list: Usuario[] = Array.isArray(j) ? j : (j.data ?? []);
        setUsuarios(list);
      });
  }, []);

  async function handleSave() {
    if (!nome.trim()) { setError("Nome é obrigatório"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/empresa/colaboradores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome:         nome.trim(),
          cpf:          cpf.trim()  || null,
          rg:           rg.trim()   || null,
          email:        email.trim() || null,
          telefone:     telefone.trim() || null,
          cargo:        cargo.trim()   || null,
          departamento: departamento.trim() || null,
          dataAdmissao: dataAdmissao || null,
          filialId:     filialId     || null,
          usuarioId:    usuarioId    || null,
          ativo,
          observacoes:  observacoes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Erro ao salvar"); return; }
      router.push(`/empresa/colaboradores/${json.id}`);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Novo Colaborador"
        breadcrumbs={[
          { label: "Empresa" },
          { label: "Colaboradores", href: "/empresa/colaboradores" },
          { label: "Novo" },
        ]}
      />

      <div className="px-8 pb-8 max-w-3xl space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Dados pessoais */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dados Pessoais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Nome" required>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome completo"
                autoFocus
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="CPF">
                <Input
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  placeholder="000.000.000-00"
                />
              </Field>
              <Field label="RG">
                <Input
                  value={rg}
                  onChange={(e) => setRg(e.target.value)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="E-mail">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="colaborador@empresa.com"
                />
              </Field>
              <Field
                label="Telefone (WhatsApp)"
                hint="Usado nos fluxos de aprovação via WhatsApp"
              >
                <Input
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="(00) 00000-0000"
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        {/* Dados funcionais */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dados Funcionais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Cargo">
                <Input
                  value={cargo}
                  onChange={(e) => setCargo(e.target.value)}
                  placeholder="Ex: Analista de Compras"
                />
              </Field>
              <Field label="Departamento">
                <Input
                  value={departamento}
                  onChange={(e) => setDepartamento(e.target.value)}
                  placeholder="Ex: Suprimentos"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Data de Admissão">
                <Input
                  type="date"
                  value={dataAdmissao}
                  onChange={(e) => setDataAdmissao(e.target.value)}
                />
              </Field>
              <Field label="Filial">
                <select
                  value={filialId}
                  onChange={(e) => setFilialId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <option value="">Selecionar filial...</option>
                  {filiais.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nomeFantasia || f.razaoSocial}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Usuário do sistema" hint="Vincule a um usuário existente (opcional)">
              <select
                value={usuarioId}
                onChange={(e) => setUsuarioId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="">Nenhum / Sem vínculo</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome} — {u.email}
                  </option>
                ))}
              </select>
            </Field>

            <div className="flex items-center gap-3 pt-1">
              <input
                id="ativo"
                type="checkbox"
                checked={ativo}
                onChange={(e) => setAtivo(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="ativo" className="cursor-pointer">Colaborador ativo</Label>
            </div>
          </CardContent>
        </Card>

        {/* Observações */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Informações adicionais..."
              rows={4}
            />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-2">
          <Button variant="outline" asChild disabled={saving}>
            <Link href="/empresa/colaboradores">
              <X className="w-4 h-4 mr-1" /> Cancelar
            </Link>
          </Button>
          <Button onClick={handleSave} disabled={saving || !nome.trim()}>
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
