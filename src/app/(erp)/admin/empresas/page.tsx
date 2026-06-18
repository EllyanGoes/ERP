"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, Loader2, Pencil, Save, ShieldAlert, X } from "lucide-react";
import { useSession } from "@/lib/session-context";

type Empresa = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string;
  ie: string | null;
  slug: string | null;
  ativo: boolean;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  estado: string | null;
};

export default function EmpresasGrupoPage() {
  const { user, refresh } = useSession();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState<Empresa | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/empresas");
      const json = await res.json();
      if (!res.ok) setErro(json.error ?? "Erro ao carregar empresas");
      else setEmpresas(json.data);
    } catch {
      setErro("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (user && user.perfil !== "ADMIN") {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
        <ShieldAlert className="w-8 h-8" />
        <p className="text-sm">Cadastro de empresas do grupo é restrito a administradores.</p>
      </div>
    );
  }

  async function salvar() {
    if (!editando) return;
    if (!editando.razaoSocial.trim() || !editando.cnpj.trim()) {
      setErro("Razão social e CNPJ são obrigatórios");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const res = await fetch(`/api/admin/empresas/${editando.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          razaoSocial: editando.razaoSocial.trim(),
          nomeFantasia: editando.nomeFantasia?.trim() ?? "",
          cnpj: editando.cnpj.trim(),
          ie: editando.ie ?? "",
          slug: editando.slug ?? "",
          email: editando.email ?? "",
          telefone: editando.telefone ?? "",
          cidade: editando.cidade ?? "",
          estado: editando.estado ?? "",
          ativo: editando.ativo,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json.error ?? "Erro ao salvar");
        return;
      }
      setEditando(null);
      await carregar();
      refresh(); // atualiza o nome no seletor de empresa do topo
    } catch {
      setErro("Erro de conexão");
    } finally {
      setSalvando(false);
    }
  }

  const campo = (rotulo: string, valor: string | null, onChange: (v: string) => void, obrigatorio = false) => (
    <div className="space-y-1.5">
      <Label>{rotulo}{obrigatorio && <span className="text-red-500"> *</span>}</Label>
      <Input value={valor ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Empresas do Grupo"
        breadcrumbs={[{ label: "Administração" }, { label: "Empresas do Grupo" }]}
      />

      <div className="px-8 pb-12 max-w-4xl space-y-6">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5" />
          Razão social, nome fantasia e CNPJ são propagados para o Cliente e o Fornecedor
          vinculados de cada empresa (usados nas operações intragrupo).
        </p>

        {erro && (
          <div className="bg-danger/10 border border-danger/30 text-danger text-sm px-4 py-3 rounded-xl">{erro}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <section className="bg-card border border-border rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted">
                  <th className="px-6 py-3 font-medium">Empresa</th>
                  <th className="px-6 py-3 font-medium">CNPJ</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody>
                {empresas.map((e) => (
                  <tr key={e.id} className="border-b border-border">
                    <td className="px-6 py-3">
                      <p className="font-medium text-foreground">{e.nomeFantasia ?? e.razaoSocial}</p>
                      <p className="text-xs text-muted-foreground">{e.razaoSocial}</p>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">{e.cnpj}</td>
                    <td className="px-6 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${e.ativo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                        {e.ativo ? "Ativa" : "Inativa"}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Button variant="outline" size="sm" onClick={() => { setErro(""); setEditando({ ...e }); }}>
                        <Pencil className="w-3.5 h-3.5 mr-1" />
                        Editar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {editando && (
          <section className="bg-card border border-info/30 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-info/10 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">
                Editando: {editando.nomeFantasia ?? editando.razaoSocial}
              </h2>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditando(null)} disabled={salvando}>
                  <X className="w-4 h-4 mr-1" />Cancelar
                </Button>
                <Button size="sm" onClick={salvar} disabled={salvando}>
                  {salvando
                    ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Salvando...</>
                    : <><Save className="w-4 h-4 mr-1" />Salvar</>}
                </Button>
              </div>
            </div>
            <div className="px-6 py-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
              {campo("Razão Social", editando.razaoSocial, (v) => setEditando({ ...editando, razaoSocial: v }), true)}
              {campo("Nome Fantasia", editando.nomeFantasia, (v) => setEditando({ ...editando, nomeFantasia: v }))}
              {campo("CNPJ", editando.cnpj, (v) => setEditando({ ...editando, cnpj: v }), true)}
              {campo("Inscrição Estadual", editando.ie, (v) => setEditando({ ...editando, ie: v }))}
              {campo("E-mail", editando.email, (v) => setEditando({ ...editando, email: v }))}
              {campo("Telefone", editando.telefone, (v) => setEditando({ ...editando, telefone: v }))}
              {campo("Cidade", editando.cidade, (v) => setEditando({ ...editando, cidade: v }))}
              {campo("Estado (UF)", editando.estado, (v) => setEditando({ ...editando, estado: v }))}
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={editando.ativo ? "true" : "false"}
                  onValueChange={(v) => setEditando({ ...editando, ativo: v === "true" })}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent position="popper" sideOffset={4}>
                    <SelectItem value="true">Ativa</SelectItem>
                    <SelectItem value="false">Inativa</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Inativa some do seletor e do consolidado.</p>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
