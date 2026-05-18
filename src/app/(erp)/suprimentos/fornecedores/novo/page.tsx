"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Plus, ArrowLeft } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type FormData = {
  tipoPessoa: "JURIDICA" | "FISICA";
  razaoSocial: string;
  nomeFantasia: string;
  cpfCnpj: string;
  ie: string;
  email: string;
  telefone: string;
  celular: string;
  contato: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  observacoes: string;
};

const INITIAL: FormData = {
  tipoPessoa: "JURIDICA",
  razaoSocial: "",
  nomeFantasia: "",
  cpfCnpj: "",
  ie: "",
  email: "",
  telefone: "",
  celular: "",
  contato: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  observacoes: "",
};

export default function NovoFornecedorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialNome = searchParams.get("nome") ?? searchParams.get("razaoSocial") ?? "";
  const [form, setForm] = useState<FormData>({ ...INITIAL, razaoSocial: initialNome, nomeFantasia: initialNome });
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");
  const [savedName, setSavedName] = useState<string | null>(null); // nome do fornecedor salvo
  const [savedId, setSavedId]   = useState<string | null>(null);
  const [nomeFantasiaEdited, setNomeFantasiaEdited] = useState(false);

  function set(key: keyof FormData, value: string) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Auto-fill nomeFantasia from razaoSocial if user hasn't manually changed it
      if (key === "razaoSocial" && !nomeFantasiaEdited) {
        next.nomeFantasia = value;
      }
      return next;
    });
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function setNomeFantasia(value: string) {
    setNomeFantasiaEdited(true);
    setForm((prev) => ({ ...prev, nomeFantasia: value }));
  }

  function validate(): boolean {
    const newErrors: Partial<Record<keyof FormData, string>> = {};
    if (!form.tipoPessoa) newErrors.tipoPessoa = "Tipo de pessoa é obrigatório";
    if (!form.razaoSocial.trim()) newErrors.razaoSocial = "Razão social é obrigatória";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setServerError("");
    try {
      const res = await fetch("/api/suprimentos/fornecedores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error || "Erro ao salvar fornecedor");
        return;
      }
      // Show confirmation dialog instead of immediately redirecting
      setSavedName(json.nomeFantasia || json.razaoSocial);
      setSavedId(json.id);
    } catch {
      setServerError("Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setForm({ ...INITIAL });
    setErrors({});
    setServerError("");
    setSavedName(null);
    setSavedId(null);
    // Scroll to top
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div>
      {/* ── Success modal ────────────────────────────────────────────────── */}
      {savedName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-sm mx-4 p-6 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
              </div>
            </div>
            <h3 className="text-base font-semibold text-gray-900">Fornecedor cadastrado!</h3>
            <p className="mt-1 text-sm text-gray-500">
              <strong className="text-gray-700">{savedName}</strong> foi salvo com sucesso.
            </p>
            <p className="mt-4 text-sm font-medium text-gray-700">Deseja cadastrar outro fornecedor?</p>
            <div className="flex flex-col gap-2 mt-4">
              <Button
                onClick={resetForm}
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Sim, cadastrar outro
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/suprimentos/fornecedores")}
                className="w-full"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Não, voltar para Fornecedores
              </Button>
              <button
                onClick={() => router.push(`/suprimentos/fornecedores/${savedId}`)}
                className="text-xs text-gray-400 hover:text-gray-600 mt-1"
              >
                Ver cadastro de {savedName} →
              </button>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="Novo Fornecedor"
        breadcrumbs={[
          { label: "Suprimentos" },
          { label: "Fornecedores", href: "/suprimentos/fornecedores" },
          { label: "Novo" },
        ]}
      />
      <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-6 max-w-4xl">
        {serverError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {serverError}
          </div>
        )}

        {/* Dados Principais */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados Principais</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tipo de Pessoa <span className="text-red-500">*</span></Label>
              <Select value={form.tipoPessoa} onValueChange={(v) => set("tipoPessoa", v as "JURIDICA" | "FISICA")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="JURIDICA">Pessoa Jurídica</SelectItem>
                  <SelectItem value="FISICA">Pessoa Física</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>
                {form.tipoPessoa === "JURIDICA" ? "CNPJ" : "CPF"}
              </Label>
              <Input
                value={form.cpfCnpj}
                onChange={(e) => set("cpfCnpj", e.target.value)}
                placeholder={form.tipoPessoa === "JURIDICA" ? "00.000.000/0000-00" : "000.000.000-00"}
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label>
                Razão Social <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.razaoSocial}
                onChange={(e) => set("razaoSocial", e.target.value)}
                placeholder="Razão Social"
              />
              {errors.razaoSocial && <p className="text-red-500 text-xs">{errors.razaoSocial}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Nome Fantasia</Label>
              <Input
                value={form.nomeFantasia}
                onChange={(e) => setNomeFantasia(e.target.value)}
                placeholder="Auto-preenchido com a Razão Social"
              />
            </div>

            <div className="space-y-1.5">
              <Label>
                {form.tipoPessoa === "JURIDICA" ? "Inscrição Estadual" : "RG"}
              </Label>
              <Input value={form.ie} onChange={(e) => set("ie", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Contato */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contato</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={form.telefone} onChange={(e) => set("telefone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Celular</Label>
              <Input value={form.celular} onChange={(e) => set("celular", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Pessoa de Contato</Label>
              <Input
                value={form.contato}
                onChange={(e) => set("contato", e.target.value)}
                placeholder="Nome do responsável"
              />
            </div>
          </CardContent>
        </Card>

        {/* Endereço */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Endereço</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>CEP</Label>
              <Input value={form.cep} onChange={(e) => set("cep", e.target.value)} placeholder="00000-000" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Logradouro</Label>
              <Input value={form.logradouro} onChange={(e) => set("logradouro", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Número</Label>
              <Input value={form.numero} onChange={(e) => set("numero", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Complemento</Label>
              <Input value={form.complemento} onChange={(e) => set("complemento", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Bairro</Label>
              <Input value={form.bairro} onChange={(e) => set("bairro", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Cidade</Label>
              <Input value={form.cidade} onChange={(e) => set("cidade", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Estado (UF)</Label>
              <Input value={form.estado} onChange={(e) => set("estado", e.target.value)} maxLength={2} />
            </div>
          </CardContent>
        </Card>

        {/* Observações */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={form.observacoes}
              onChange={(e) => set("observacoes", e.target.value)}
              rows={3}
              placeholder="Observações adicionais..."
            />
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Salvando..." : "Salvar Fornecedor"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
