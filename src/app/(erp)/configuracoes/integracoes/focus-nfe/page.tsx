"use client";

// Integração Focus NFe (módulo Fiscal). Aqui ficam as credenciais GLOBAIS da
// conta (master token + secret do webhook, na tabela Configuracao) e o status
// por empresa. Os tokens de emissão de cada CNPJ ficam em EmpresaFiscal e são
// geridos em Fiscal → Configuração Fiscal (com a empresa ativa no seletor).

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Loader2, Save, Receipt, ExternalLink, ShieldCheck, ShieldAlert,
  CheckCircle2, XCircle, RefreshCcw,
} from "lucide-react";

type EmpresaStatus = {
  id: string;
  razaoSocial: string;
  cnpj: string;
  configurada: boolean;
  ambiente: string | null;
  temTokenHomologacao: boolean;
  temTokenProducao: boolean;
  sincronizada: boolean;
  certificadoStatus: string | null;
  certificadoValidade: string | null;
};

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", ok ? "text-emerald-600" : "text-muted-foreground")}>
      {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
      {label}
    </span>
  );
}

export default function FocusNfeIntegracaoPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [masterToken, setMasterToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [empresas, setEmpresas] = useState<EmpresaStatus[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, status] = await Promise.all([
        fetch("/api/configuracoes/integracoes").then((r) => r.json()),
        fetch("/api/configuracoes/integracoes/focus-nfe").then((r) => r.json()),
      ]);
      setMasterToken(cfg.fiscal_master_token ?? "");
      setWebhookSecret(cfg.fiscal_webhook_secret ?? "");
      setEmpresas(Array.isArray(status.empresas) ? status.empresas : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function salvar() {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch("/api/configuracoes/integracoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fiscal_master_token: masterToken.trim() || null,
          fiscal_webhook_secret: webhookSecret.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setMsg({ tipo: "erro", texto: json.error || "Erro ao salvar" }); return; }
      setMsg({ tipo: "ok", texto: "Credenciais salvas" });
      await load();
    } catch {
      setMsg({ tipo: "erro", texto: "Erro de conexão" });
    } finally {
      setSaving(false);
    }
  }

  function gerarSecret() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    setWebhookSecret(Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""));
  }

  return (
    <div>
      <PageHeader
        title="Focus NFe"
        breadcrumbs={[{ label: "Configurações" }, { label: "Integrações" }, { label: "Focus NFe" }]}
        subtitle="Emissão e consulta de documentos fiscais (módulo Fiscal)"
        action={
          <Button onClick={salvar} disabled={saving || loading}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Salvar
          </Button>
        }
      />

      <div className="px-8 pb-8 max-w-3xl space-y-4">
        {msg && (
          <p className={cn("text-sm rounded-lg px-3 py-2 border", msg.tipo === "ok"
            ? "text-emerald-700 bg-emerald-500/10 border-emerald-500/30"
            : "text-danger bg-danger/10 border-danger/30")}>
            {msg.texto}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="border border-border rounded-xl p-5 bg-card space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-500/15 border border-violet-100 flex items-center justify-center">
                  <Receipt className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Credenciais da conta</h3>
                  <p className="text-xs text-muted-foreground">
                    Uma conta Focus NFe atende todos os CNPJs do grupo — crie em{" "}
                    <a href="https://focusnfe.com.br" target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-0.5">
                      focusnfe.com.br <ExternalLink className="w-3 h-3" />
                    </a>
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Master token da conta</Label>
                <Input value={masterToken} onChange={(e) => setMasterToken(e.target.value)}
                  placeholder="não configurado" autoComplete="off" />
                <p className="text-xs text-muted-foreground">
                  Secret — exibido mascarado. Usado só para registrar/sincronizar empresas no provedor
                  (Fiscal → Configuração → &ldquo;Sincronizar empresa&rdquo;), que devolve os tokens de emissão por CNPJ.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Secret do webhook</Label>
                <div className="flex gap-2">
                  <Input value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)}
                    placeholder="não configurado" autoComplete="off" />
                  <Button type="button" variant="outline" size="sm" className="shrink-0 h-9" onClick={gerarSecret}>
                    <RefreshCcw className="w-3.5 h-3.5 mr-1" /> Gerar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Valida os retornos de emissão em <code>/api/webhooks/fiscal/focus-nfe</code> (F1).
                  Cadastre a mesma URL + secret no painel da Focus.
                </p>
              </div>
            </div>

            <div className="border border-border rounded-xl bg-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="font-semibold text-sm">Empresas do grupo</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tokens de emissão, ambiente e certificado são por empresa — configure em{" "}
                  <Link href="/fiscal/cadastros/configuracao" className="underline">Fiscal → Configuração Fiscal</Link>{" "}
                  com a empresa ativa no seletor.
                </p>
              </div>
              <div className="divide-y divide-border">
                {empresas.map((e) => (
                  <div key={e.id} className="px-5 py-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{e.razaoSocial}</p>
                        <p className="text-xs text-muted-foreground">CNPJ {e.cnpj}</p>
                      </div>
                      {e.configurada ? (
                        <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0",
                          e.ambiente === "PRODUCAO"
                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                            : "bg-amber-500/10 text-amber-600 border-amber-500/30")}>
                          {e.ambiente === "PRODUCAO" ? "Produção" : "Homologação"}
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                          Não configurada
                        </span>
                      )}
                    </div>
                    {e.configurada && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                        <Check ok={e.sincronizada} label="registrada no provedor" />
                        <Check ok={e.temTokenHomologacao} label="token homologação" />
                        <Check ok={e.temTokenProducao} label="token produção" />
                        <span className={cn("inline-flex items-center gap-1 text-xs",
                          e.certificadoStatus === "OK" ? "text-emerald-600"
                            : e.certificadoStatus ? "text-amber-600" : "text-muted-foreground")}>
                          {e.certificadoStatus === "OK"
                            ? <ShieldCheck className="w-3.5 h-3.5" />
                            : <ShieldAlert className="w-3.5 h-3.5" />}
                          certificado {e.certificadoStatus?.toLowerCase() ?? "não informado"}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
