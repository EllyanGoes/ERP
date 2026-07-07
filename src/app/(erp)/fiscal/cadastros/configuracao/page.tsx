"use client";

// Configuração fiscal da EMPRESA ATIVA (EmpresaFiscal 1:1): regime/CRT,
// provedor, ambiente, tokens (mascarados), CSC, DF-e. Módulo Fiscal é a camada
// oficial ISOLADA do gerencial — nada aqui toca estoque/financeiro/contábil.

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, PlugZap, RefreshCw, ShieldCheck } from "lucide-react";

type Empresa = { id: string; razaoSocial: string; cnpj: string; ie: string | null; cidade: string | null; estado: string | null };
type Config = {
  crt: number;
  regimeApuracao: string | null;
  cnaePrincipal: string | null;
  codigoMunicipioIBGE: string | null;
  provedor: string;
  ambiente: string;
  tokenHomologacao: string | null;
  tokenProducao: string | null;
  provedorEmpresaRef: string | null;
  cscId: string | null;
  cscToken: string | null;
  certificadoValidade: string | null;
  certificadoStatus: string | null;
  ultimoNsu: string;
  manifestacaoAutomatica: boolean;
  emiteIbsCbs: boolean;
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function ConfiguracaoFiscalPage() {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [testando, setTestando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  const [f, setF] = useState<Config>({
    crt: 3, regimeApuracao: null, cnaePrincipal: null, codigoMunicipioIBGE: null,
    provedor: "FOCUS_NFE", ambiente: "HOMOLOGACAO", tokenHomologacao: null, tokenProducao: null,
    provedorEmpresaRef: null, cscId: null, cscToken: null, certificadoValidade: null,
    certificadoStatus: null, ultimoNsu: "0", manifestacaoAutomatica: true, emiteIbsCbs: false,
  });
  const set = (patch: Partial<Config>) => setF((prev) => ({ ...prev, ...patch }));

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/fiscal/config");
    const data = await res.json();
    setEmpresa(data.empresa ?? null);
    if (data.config) setF((prev) => ({ ...prev, ...data.config }));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function salvar() {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch("/api/fiscal/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const json = await res.json();
      if (!res.ok) { setMsg({ tipo: "erro", texto: json.error || "Erro ao salvar" }); return; }
      setF((prev) => ({ ...prev, ...json }));
      setMsg({ tipo: "ok", texto: "Configuração salva" });
    } catch {
      setMsg({ tipo: "erro", texto: "Erro de conexão" });
    } finally {
      setSaving(false);
    }
  }

  async function testar() {
    setTestando(true); setMsg(null);
    try {
      const res = await fetch("/api/fiscal/config/testar", { method: "POST" });
      const json = await res.json();
      setMsg(json.ok
        ? { tipo: "ok", texto: json.detalhe }
        : { tipo: "erro", texto: json.error || json.detalhe || "Falha no teste" });
    } catch {
      setMsg({ tipo: "erro", texto: "Erro de conexão" });
    } finally {
      setTestando(false);
    }
  }

  async function sincronizar() {
    setSincronizando(true); setMsg(null);
    try {
      const res = await fetch("/api/fiscal/config/sincronizar", { method: "POST" });
      const json = await res.json();
      if (!res.ok) { setMsg({ tipo: "erro", texto: json.error || "Falha ao sincronizar" }); return; }
      setMsg({ tipo: "ok", texto: `Empresa sincronizada no provedor (ref ${json.provedorEmpresaRef}). ${json.aviso ?? ""}` });
      await load();
    } catch {
      setMsg({ tipo: "erro", texto: "Erro de conexão" });
    } finally {
      setSincronizando(false);
    }
  }

  const selectCls = "w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm";

  return (
    <div>
      <PageHeader
        title="Configuração Fiscal"
        breadcrumbs={[{ label: "Fiscal" }, { label: "Configuração" }]}
        action={
          <Button onClick={salvar} disabled={saving || loading}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Salvar
          </Button>
        }
      />

      <div className="px-8 pb-8 max-w-3xl space-y-4">
        {msg && (
          <p className={`text-sm rounded-lg px-3 py-2 border ${msg.tipo === "ok" ? "text-emerald-700 bg-emerald-500/10 border-emerald-500/30" : "text-danger bg-danger/10 border-danger/30"}`}>
            {msg.texto}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {empresa && (
              <div className="border border-border rounded-xl p-4 bg-muted/40 text-sm">
                <p className="font-medium text-foreground">{empresa.razaoSocial}</p>
                <p className="text-muted-foreground">CNPJ {empresa.cnpj}{empresa.ie ? ` · IE ${empresa.ie}` : ""}{empresa.cidade ? ` · ${empresa.cidade}/${empresa.estado}` : ""}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  A configuração fiscal vale para a empresa ativa. Troque de empresa no seletor para configurar as demais.
                </p>
              </div>
            )}

            <div className="border border-border rounded-xl p-5 bg-card space-y-4">
              <h3 className="font-semibold text-sm">Regime tributário</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="CRT (Código de Regime Tributário)">
                  <select className={selectCls} value={f.crt} onChange={(e) => set({ crt: Number(e.target.value) })}>
                    <option value={1}>1 — Simples Nacional</option>
                    <option value={2}>2 — Simples Nacional (excesso de sublimite)</option>
                    <option value={3}>3 — Regime Normal</option>
                    <option value={4}>4 — MEI</option>
                  </select>
                </Field>
                <Field label="Regime de apuração (informativo)">
                  <select className={selectCls} value={f.regimeApuracao ?? ""} onChange={(e) => set({ regimeApuracao: e.target.value || null })}>
                    <option value="">—</option>
                    <option value="LUCRO_REAL">Lucro Real</option>
                    <option value="LUCRO_PRESUMIDO">Lucro Presumido</option>
                    <option value="SIMPLES">Simples Nacional</option>
                  </select>
                </Field>
                <Field label="CNAE principal">
                  <Input value={f.cnaePrincipal ?? ""} onChange={(e) => set({ cnaePrincipal: e.target.value || null })} placeholder="0000-0/00" />
                </Field>
                <Field label="Código IBGE do município (cMunFG)" hint="7 dígitos — obrigatório para emitir">
                  <Input value={f.codigoMunicipioIBGE ?? ""} onChange={(e) => set({ codigoMunicipioIBGE: e.target.value || null })} placeholder="4108304" />
                </Field>
              </div>
            </div>

            <div className="border border-border rounded-xl p-5 bg-card space-y-4">
              <h3 className="font-semibold text-sm">Provedor de emissão</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Provedor">
                  <select className={selectCls} value={f.provedor} onChange={(e) => set({ provedor: e.target.value })}>
                    <option value="FOCUS_NFE">Focus NFe</option>
                  </select>
                </Field>
                <Field label="Ambiente" hint="Por empresa — homologação de uma não trava produção da outra">
                  <select className={selectCls} value={f.ambiente} onChange={(e) => set({ ambiente: e.target.value })}>
                    <option value="HOMOLOGACAO">Homologação (testes)</option>
                    <option value="PRODUCAO">Produção</option>
                  </select>
                </Field>
                <Field label="Token de homologação" hint="Secret — exibido mascarado; digite para substituir">
                  <Input value={f.tokenHomologacao ?? ""} onChange={(e) => set({ tokenHomologacao: e.target.value })} placeholder="não configurado" />
                </Field>
                <Field label="Token de produção" hint="Secret — exibido mascarado; digite para substituir">
                  <Input value={f.tokenProducao ?? ""} onChange={(e) => set({ tokenProducao: e.target.value })} placeholder="não configurado" />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={testar} disabled={testando}>
                  {testando ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <PlugZap className="w-4 h-4 mr-1" />}
                  Testar conexão
                </Button>
                <Button variant="outline" size="sm" onClick={sincronizar} disabled={sincronizando}>
                  {sincronizando ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                  Sincronizar empresa no provedor
                </Button>
                {f.provedorEmpresaRef && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground self-center">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> registrada no provedor (ref {f.provedorEmpresaRef})
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                O certificado digital A1 (.pfx) fica hospedado no provedor. A sincronização usa o master token
                da conta (Configurações → Integrações → Focus NFe) e grava os tokens de emissão da empresa.
              </p>
            </div>

            <div className="border border-border rounded-xl p-5 bg-card space-y-4">
              <h3 className="font-semibold text-sm">NFC-e e notas recebidas</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="CSC — ID (NFC-e)">
                  <Input value={f.cscId ?? ""} onChange={(e) => set({ cscId: e.target.value || null })} placeholder="000001" />
                </Field>
                <Field label="CSC — Token (NFC-e)" hint="Secret — exibido mascarado; digite para substituir">
                  <Input value={f.cscToken ?? ""} onChange={(e) => set({ cscToken: e.target.value })} placeholder="não configurado" />
                </Field>
              </div>
              <div className="flex items-center gap-2">
                <input id="f-manif" type="checkbox" className="rounded" checked={f.manifestacaoAutomatica}
                  onChange={(e) => set({ manifestacaoAutomatica: e.target.checked })} />
                <Label htmlFor="f-manif" className="cursor-pointer">
                  Ciência automática das notas destinadas (libera o XML completo na Distribuição DF-e)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <input id="f-ibscbs" type="checkbox" className="rounded" checked={f.emiteIbsCbs}
                  onChange={(e) => set({ emiteIbsCbs: e.target.checked })} />
                <Label htmlFor="f-ibscbs" className="cursor-pointer">
                  Destacar IBS/CBS (reforma tributária, NT 2025.002 — obrigatório p/ regime normal a partir de ago/2026)
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">Cursor da Distribuição DF-e (último NSU): {f.ultimoNsu}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
