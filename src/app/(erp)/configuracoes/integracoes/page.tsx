"use client";

import { useState, useEffect } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Loader2, Save, Eye, EyeOff, CheckCircle2, AlertCircle, Plug, RefreshCw,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Provider = "meta" | "zapi";

type Config = {
  wa_provider:           string | null;
  wa_meta_phone_id:      string | null;
  wa_meta_access_token:  string | null;
  wa_meta_webhook_token: string | null;
  wa_zapi_instance_id:   string | null;
  wa_zapi_token:         string | null;
  wa_zapi_security_token: string | null;
};

const emptyConfig: Config = {
  wa_provider:           null,
  wa_meta_phone_id:      null,
  wa_meta_access_token:  null,
  wa_meta_webhook_token: null,
  wa_zapi_instance_id:   null,
  wa_zapi_token:         null,
  wa_zapi_security_token: null,
};

// ── Field helpers ─────────────────────────────────────────────────────────────

function ConfigField({
  label, description, value, onChange, sensitive, placeholder,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (v: string) => void;
  sensitive?: boolean;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {description && <p className="text-xs text-gray-400">{description}</p>}
      <div className="relative">
        <Input
          type={sensitive && !show ? "password" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-10"
        />
        {sensitive && (
          <button
            type="button"
            onClick={() => setShow((p) => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            tabIndex={-1}
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IntegracoesPage() {
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [testing,   setTesting]   = useState(false);
  const [pageError, setPageError] = useState("");
  const [saveMsg,   setSaveMsg]   = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [dirty, setDirty]         = useState(false);

  const [provider,        setProvider]       = useState<Provider>("meta");
  const [metaPhoneId,     setMetaPhoneId]    = useState("");
  const [metaToken,       setMetaToken]      = useState("");
  const [metaWebhook,     setMetaWebhook]    = useState("");
  const [zapiInstanceId,  setZapiInstanceId] = useState("");
  const [zapiToken,       setZapiToken]      = useState("");
  const [zapiSecurity,    setZapiSecurity]   = useState("");

  function markDirty() { setDirty(true); setSaveMsg(null); setTestResult(null); }

  function setProviderAndDirty(p: Provider) { setProvider(p); markDirty(); }
  function setMetaPhoneIdAndDirty(v: string) { setMetaPhoneId(v); markDirty(); }
  function setMetaTokenAndDirty(v: string)   { setMetaToken(v); markDirty(); }
  function setMetaWebhookAndDirty(v: string) { setMetaWebhook(v); markDirty(); }
  function setZapiInstanceAndDirty(v: string) { setZapiInstanceId(v); markDirty(); }
  function setZapiTokenAndDirty(v: string)   { setZapiToken(v); markDirty(); }
  function setZapiSecurityAndDirty(v: string) { setZapiSecurity(v); markDirty(); }

  useEffect(() => {
    fetch("/api/configuracoes/integracoes")
      .then((r) => r.json())
      .then((cfg: Config) => {
        setProvider((cfg.wa_provider as Provider) ?? "meta");
        setMetaPhoneId(cfg.wa_meta_phone_id ?? "");
        setMetaToken(cfg.wa_meta_access_token ?? "");
        setMetaWebhook(cfg.wa_meta_webhook_token ?? "");
        setZapiInstanceId(cfg.wa_zapi_instance_id ?? "");
        setZapiToken(cfg.wa_zapi_token ?? "");
        setZapiSecurity(cfg.wa_zapi_security_token ?? "");
      })
      .catch(() => setPageError("Erro ao carregar configurações"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true); setSaveMsg(null);
    try {
      const body: Record<string, string | null> = {
        wa_provider:            provider,
        wa_meta_phone_id:       metaPhoneId.trim()   || null,
        wa_meta_access_token:   metaToken.trim()      || null,
        wa_meta_webhook_token:  metaWebhook.trim()    || null,
        wa_zapi_instance_id:    zapiInstanceId.trim() || null,
        wa_zapi_token:          zapiToken.trim()       || null,
        wa_zapi_security_token: zapiSecurity.trim()   || null,
      };

      const res = await fetch("/api/configuracoes/integracoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json();
        setSaveMsg({ type: "err", text: json.error || "Erro ao salvar" });
        return;
      }

      setSaveMsg({ type: "ok", text: "Configurações salvas com sucesso!" });
      setDirty(false);
    } catch {
      setSaveMsg({ type: "err", text: "Erro de conexão. Tente novamente." });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true); setTestResult(null);
    try {
      // Simple connectivity test — just verifies credentials are set
      if (provider === "meta") {
        if (!metaPhoneId.trim() || !metaToken.trim()) {
          setTestResult({ ok: false, msg: "Preencha o Phone Number ID e o Access Token antes de testar." });
          return;
        }
        // Test by fetching phone number info from Meta API
        const res = await fetch(
          `https://graph.facebook.com/v19.0/${metaPhoneId}`,
          { headers: { Authorization: `Bearer ${metaToken}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setTestResult({ ok: true, msg: `Conexão OK — número: ${data.display_phone_number ?? data.id}` });
        } else {
          const err = await res.json().catch(() => ({}));
          setTestResult({ ok: false, msg: `Erro ${res.status}: ${err?.error?.message ?? "credenciais inválidas"}` });
        }
      } else {
        if (!zapiInstanceId.trim() || !zapiToken.trim()) {
          setTestResult({ ok: false, msg: "Preencha o Instance ID e o Token antes de testar." });
          return;
        }
        const headers: Record<string, string> = {};
        if (zapiSecurity.trim()) headers["Client-Token"] = zapiSecurity.trim();
        const res = await fetch(
          `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiToken}/status`,
          { headers }
        );
        if (res.ok) {
          const data = await res.json();
          setTestResult({ ok: true, msg: `Conexão OK — status: ${data?.connected ? "conectado" : "desconectado"}` });
        } else {
          setTestResult({ ok: false, msg: `Erro ${res.status}: credenciais inválidas` });
        }
      }
    } catch {
      setTestResult({ ok: false, msg: "Não foi possível conectar. Verifique os dados e tente novamente." });
    } finally {
      setTesting(false);
    }
  }

  if (loading) return (
    <div className="px-8 pt-8 text-gray-400 flex items-center gap-2">
      <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Integrações"
        breadcrumbs={[{ label: "Configurações" }, { label: "Integrações" }]}
      />

      <div className="px-8 pb-8 max-w-2xl space-y-5">
        {pageError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {pageError}
          </div>
        )}

        {/* WhatsApp */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                <Plug className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <CardTitle className="text-base">WhatsApp</CardTitle>
                <p className="text-xs text-gray-400 mt-0.5">
                  Integração de mensagens para fluxos de aprovação
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            {/* Provider selector */}
            <div className="space-y-2">
              <Label>Provedor</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setProviderAndDirty("meta")}
                  className={cn(
                    "flex flex-col items-start gap-1 p-3 rounded-xl border-2 transition-colors text-left",
                    provider === "meta"
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  )}
                >
                  <span className={cn("text-sm font-semibold", provider === "meta" ? "text-blue-700" : "text-gray-700")}>
                    Meta Cloud API
                  </span>
                  <span className="text-xs text-gray-400">Oficial · WhatsApp Business API</span>
                </button>
                <button
                  type="button"
                  onClick={() => setProviderAndDirty("zapi")}
                  className={cn(
                    "flex flex-col items-start gap-1 p-3 rounded-xl border-2 transition-colors text-left",
                    provider === "zapi"
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  )}
                >
                  <span className={cn("text-sm font-semibold", provider === "zapi" ? "text-blue-700" : "text-gray-700")}>
                    Z-API
                  </span>
                  <span className="text-xs text-gray-400">Terceiros · instância própria</span>
                </button>
              </div>
            </div>

            {/* Separator */}
            <div className="border-t border-gray-100" />

            {/* Meta fields */}
            {provider === "meta" && (
              <div className="space-y-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Meta Cloud API</p>
                <ConfigField
                  label="Phone Number ID"
                  description="ID do número de telefone no painel do Meta Business"
                  value={metaPhoneId}
                  onChange={setMetaPhoneIdAndDirty}
                  placeholder="1234567890"
                />
                <ConfigField
                  label="Access Token"
                  description="Token de acesso permanente gerado no Meta Business Suite"
                  value={metaToken}
                  onChange={setMetaTokenAndDirty}
                  sensitive
                  placeholder="EAAGm..."
                />
                <ConfigField
                  label="Webhook Token"
                  description="Token de verificação configurado no webhook do Meta"
                  value={metaWebhook}
                  onChange={setMetaWebhookAndDirty}
                  sensitive
                  placeholder="meu_token_secreto"
                />
              </div>
            )}

            {/* Z-API fields */}
            {provider === "zapi" && (
              <div className="space-y-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Z-API</p>
                <ConfigField
                  label="Instance ID"
                  description="ID da instância no painel da Z-API"
                  value={zapiInstanceId}
                  onChange={setZapiInstanceAndDirty}
                  placeholder="3A..."
                />
                <ConfigField
                  label="Token"
                  description="Token da instância Z-API"
                  value={zapiToken}
                  onChange={setZapiTokenAndDirty}
                  sensitive
                  placeholder="F3B..."
                />
                <ConfigField
                  label="Security Token"
                  description="Client-Token de segurança (opcional)"
                  value={zapiSecurity}
                  onChange={setZapiSecurityAndDirty}
                  sensitive
                  placeholder="Fs6..."
                />
              </div>
            )}

            {/* Test result */}
            {testResult && (
              <div className={cn(
                "flex items-start gap-2 px-4 py-3 rounded-xl text-sm border",
                testResult.ok
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-red-50 border-red-200 text-red-700"
              )}>
                {testResult.ok
                  ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  : <AlertCircle  className="w-4 h-4 mt-0.5 shrink-0" />
                }
                <span>{testResult.msg}</span>
              </div>
            )}

            {/* Save message */}
            {saveMsg && (
              <div className={cn(
                "flex items-center gap-2 px-4 py-3 rounded-xl text-sm border",
                saveMsg.type === "ok"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-red-50 border-red-200 text-red-700"
              )}>
                {saveMsg.type === "ok"
                  ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                  : <AlertCircle  className="w-4 h-4 shrink-0" />
                }
                <span>{saveMsg.text}</span>
              </div>
            )}

            {/* Unsaved indicator */}
            {dirty && !saveMsg && (
              <p className="text-xs text-amber-600 font-medium">
                Alterações não salvas
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTest}
                disabled={testing || saving}
              >
                {testing ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-1" />Testando...</>
                ) : (
                  <><RefreshCw className="w-4 h-4 mr-1" />Testar Conexão</>
                )}
              </Button>

              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || testing}
              >
                {saving ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-1" />Salvando...</>
                ) : (
                  <><Save className="w-4 h-4 mr-1" />Salvar Configurações</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
