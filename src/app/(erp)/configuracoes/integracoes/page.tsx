"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Loader2, Save, Eye, EyeOff, CheckCircle2, AlertCircle,
  RefreshCw, ChevronDown, MessageCircle, Wifi, WifiOff, HelpCircle,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Provider    = "meta" | "zapi";
type ConnStatus  = "idle" | "checking" | "ok" | "error" | "unconfigured";

type Config = {
  wa_provider:            string | null;
  wa_meta_phone_id:       string | null;
  wa_meta_access_token:   string | null;
  wa_meta_webhook_token:  string | null;
  wa_zapi_instance_id:    string | null;
  wa_zapi_token:          string | null;
  wa_zapi_security_token: string | null;
};

// ── Subcomponents ─────────────────────────────────────────────────────────────

function StatusPill({ status, msg }: { status: ConnStatus; msg?: string }) {
  if (status === "checking") return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
      <Loader2 className="w-3 h-3 animate-spin" /> Verificando...
    </span>
  );
  if (status === "ok") return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
      <Wifi className="w-3 h-3" /> Conectado
    </span>
  );
  if (status === "error") return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700" title={msg}>
      <WifiOff className="w-3 h-3" /> Erro de conexão
    </span>
  );
  if (status === "unconfigured") return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-400">
      <HelpCircle className="w-3 h-3" /> Não configurado
    </span>
  );
  return null;
}

function SecretField({
  label, description, value, onChange, placeholder, readOnly,
}: {
  label: string; description?: string; value: string;
  onChange?: (v: string) => void; placeholder?: string; readOnly?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-gray-600">{label}</Label>
      {description && <p className="text-[11px] text-gray-400 leading-tight">{description}</p>}
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          readOnly={readOnly}
          placeholder={placeholder}
          className={cn("pr-10 h-9 text-sm font-mono", readOnly && "bg-gray-50 text-gray-500 cursor-default")}
        />
        {value && (
          <button
            type="button"
            onClick={() => setShow((p) => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            tabIndex={-1}
          >
            {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}

function PlainField({
  label, description, value, onChange, placeholder, readOnly,
}: {
  label: string; description?: string; value: string;
  onChange?: (v: string) => void; placeholder?: string; readOnly?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-gray-600">{label}</Label>
      {description && <p className="text-[11px] text-gray-400 leading-tight">{description}</p>}
      <Input
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        readOnly={readOnly}
        placeholder={placeholder}
        className={cn("h-9 text-sm font-mono", readOnly && "bg-gray-50 text-gray-500 cursor-default")}
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IntegracoesPage() {
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [testing,  setTesting]  = useState(false);
  const [saveMsg,  setSaveMsg]  = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [testMsg,  setTestMsg]  = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty,    setDirty]    = useState(false);

  // WhatsApp state
  const [waStatus,       setWaStatus]       = useState<ConnStatus>("idle");
  const [waStatusMsg,    setWaStatusMsg]    = useState("");
  const [waOpen,         setWaOpen]         = useState(false);
  const [provider,       setProvider]       = useState<Provider>("meta");
  const [metaPhoneId,    setMetaPhoneId]    = useState("");
  const [metaToken,      setMetaToken]      = useState("");
  const [metaWebhook,    setMetaWebhook]    = useState("");
  const [zapiInstanceId, setZapiInstanceId] = useState("");
  const [zapiToken,      setZapiToken]      = useState("");
  const [zapiSecurity,   setZapiSecurity]   = useState("");

  function mark() { setDirty(true); setSaveMsg(null); setTestMsg(null); }

  // ── Load config ─────────────────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const cfg: Config = await fetch("/api/configuracoes/integracoes").then((r) => r.json());
      const prov = (cfg.wa_provider as Provider) ?? "meta";
      setProvider(prov);
      setMetaPhoneId(cfg.wa_meta_phone_id ?? "");
      setMetaToken(cfg.wa_meta_access_token ?? "");
      setMetaWebhook(cfg.wa_meta_webhook_token ?? "");
      setZapiInstanceId(cfg.wa_zapi_instance_id ?? "");
      setZapiToken(cfg.wa_zapi_token ?? "");
      setZapiSecurity(cfg.wa_zapi_security_token ?? "");

      // Auto-check connection status
      const hasCredentials = prov === "meta"
        ? !!(cfg.wa_meta_phone_id && cfg.wa_meta_access_token)
        : !!(cfg.wa_zapi_instance_id && cfg.wa_zapi_token);

      if (!hasCredentials) {
        setWaStatus("unconfigured");
      } else {
        checkStatus(prov, {
          phoneId:    cfg.wa_meta_phone_id ?? "",
          token:      cfg.wa_meta_access_token ?? "",
          instanceId: cfg.wa_zapi_instance_id ?? "",
          zapiTok:    cfg.wa_zapi_token ?? "",
          security:   cfg.wa_zapi_security_token ?? "",
        });
      }
    } catch {
      setWaStatus("unconfigured");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // ── Check connection status (silent) ────────────────────────────────────────
  async function checkStatus(prov: Provider, creds: {
    phoneId: string; token: string;
    instanceId: string; zapiTok: string; security: string;
  }) {
    setWaStatus("checking");
    setWaStatusMsg("");
    try {
      if (prov === "meta") {
        const res = await fetch(
          `https://graph.facebook.com/v19.0/${creds.phoneId}`,
          { headers: { Authorization: `Bearer ${creds.token}` } }
        );
        if (res.ok) {
          const d = await res.json();
          setWaStatus("ok");
          setWaStatusMsg(d.display_phone_number ? `Número: ${d.display_phone_number}` : "");
        } else {
          const err = await res.json().catch(() => ({}));
          setWaStatus("error");
          setWaStatusMsg(err?.error?.message ?? `HTTP ${res.status}`);
        }
      } else {
        const headers: Record<string, string> = {};
        if (creds.security) headers["Client-Token"] = creds.security;
        const res = await fetch(
          `https://api.z-api.io/instances/${creds.instanceId}/token/${creds.zapiTok}/status`,
          { headers }
        );
        if (res.ok) {
          const d = await res.json();
          setWaStatus(d?.connected ? "ok" : "error");
          setWaStatusMsg(d?.connected ? "Instância conectada" : "Instância desconectada");
        } else {
          setWaStatus("error");
          setWaStatusMsg(`HTTP ${res.status}: credenciais inválidas`);
        }
      }
    } catch {
      setWaStatus("error");
      setWaStatusMsg("Sem resposta do servidor de integração");
    }
  }

  // ── Test (manual, shows message) ─────────────────────────────────────────────
  async function handleTest() {
    setTesting(true); setTestMsg(null);
    const hasCreds = provider === "meta"
      ? !!(metaPhoneId.trim() && metaToken.trim())
      : !!(zapiInstanceId.trim() && zapiToken.trim());

    if (!hasCreds) {
      setTestMsg({ ok: false, text: "Preencha as credenciais antes de testar." });
      setTesting(false);
      return;
    }

    await checkStatus(provider, {
      phoneId: metaPhoneId, token: metaToken,
      instanceId: zapiInstanceId, zapiTok: zapiToken, security: zapiSecurity,
    });

    // waStatus is set async; read the result via the state after checkStatus
    setTesting(false);
    // Show a short toast derived from the status update
    setTestMsg(null); // status pill already updated
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true); setSaveMsg(null); setTestMsg(null);
    try {
      const body: Record<string, string | null> = {
        wa_provider:            provider,
        wa_meta_phone_id:       metaPhoneId.trim()    || null,
        wa_meta_access_token:   metaToken.trim()       || null,
        wa_meta_webhook_token:  metaWebhook.trim()     || null,
        wa_zapi_instance_id:    zapiInstanceId.trim()  || null,
        wa_zapi_token:          zapiToken.trim()        || null,
        wa_zapi_security_token: zapiSecurity.trim()    || null,
      };
      const res = await fetch("/api/configuracoes/integracoes", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) { setSaveMsg({ type: "err", text: (await res.json()).error || "Erro ao salvar" }); return; }
      setSaveMsg({ type: "ok", text: "Configurações salvas!" });
      setDirty(false);
      // Re-check status after save
      checkStatus(provider, {
        phoneId: metaPhoneId, token: metaToken,
        instanceId: zapiInstanceId, zapiTok: zapiToken, security: zapiSecurity,
      });
    } catch {
      setSaveMsg({ type: "err", text: "Erro de conexão." });
    } finally {
      setSaving(false);
    }
  }

  // ── Integration row ──────────────────────────────────────────────────────────
  // Each integration = collapsible accordion row
  const waHasAny = metaPhoneId || metaToken || zapiInstanceId || zapiToken;

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="px-8 pt-8 text-gray-400 flex items-center gap-2 text-sm">
      <Loader2 className="w-4 h-4 animate-spin" /> Carregando integrações...
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Integrações"
        breadcrumbs={[{ label: "Configurações" }, { label: "Integrações" }]}
      />

      <div className="px-8 pb-8 max-w-3xl space-y-3">

        {/* ── WhatsApp ──────────────────────────────────────────────────────── */}
        <div className={cn(
          "bg-white rounded-2xl border transition-all duration-200",
          waOpen ? "border-gray-300 shadow-sm" : "border-gray-200"
        )}>
          {/* Row header — always visible */}
          <button
            type="button"
            onClick={() => setWaOpen((p) => !p)}
            className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50/60 transition-colors rounded-2xl"
          >
            {/* Icon */}
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
              <MessageCircle className="w-5 h-5 text-emerald-600" />
            </div>

            {/* Name + description */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-gray-900 text-sm">WhatsApp Business</p>
                <span className={cn(
                  "text-[10px] font-medium px-2 py-0.5 rounded-full border",
                  provider === "meta"
                    ? "bg-blue-50 text-blue-600 border-blue-100"
                    : "bg-purple-50 text-purple-600 border-purple-100"
                )}>
                  {provider === "meta" ? "Meta Cloud API" : "Z-API"}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Mensagens e aprovações de Solicitações de Compra via WhatsApp
              </p>
            </div>

            {/* Status + chevron */}
            <div className="flex items-center gap-3 shrink-0">
              <StatusPill status={waStatus} msg={waStatusMsg} />
              {waStatus === "ok" && waStatusMsg && (
                <span className="text-xs text-gray-400 hidden sm:block max-w-[160px] truncate" title={waStatusMsg}>
                  {waStatusMsg}
                </span>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); checkStatus(provider, { phoneId: metaPhoneId, token: metaToken, instanceId: zapiInstanceId, zapiTok: zapiToken, security: zapiSecurity }); }}
                className="p-1.5 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
                title="Verificar conexão"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform duration-200", waOpen && "rotate-180")} />
            </div>
          </button>

          {/* Expanded content */}
          {waOpen && (
            <div className="px-5 pb-5 space-y-5 border-t border-gray-100">
              <div className="pt-4" />

              {/* Provider toggle */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Provedor</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["meta", "zapi"] as Provider[]).map((p) => (
                    <button
                      key={p} type="button"
                      onClick={() => { setProvider(p); mark(); }}
                      className={cn(
                        "flex flex-col items-start gap-0.5 px-4 py-3 rounded-xl border-2 text-left transition-colors",
                        provider === p
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300 bg-white"
                      )}
                    >
                      <span className={cn("text-sm font-semibold", provider === p ? "text-blue-700" : "text-gray-700")}>
                        {p === "meta" ? "Meta Cloud API" : "Z-API"}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        {p === "meta" ? "Oficial · WhatsApp Business" : "Terceiros · instância própria"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Credentials */}
              <div className="space-y-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Credenciais de Acesso</p>

                {provider === "meta" ? (
                  <div className="space-y-3">
                    <PlainField
                      label="Phone Number ID"
                      description="ID do número de telefone no painel do Meta Business"
                      value={metaPhoneId}
                      onChange={(v) => { setMetaPhoneId(v); mark(); }}
                      placeholder="1234567890"
                    />
                    <SecretField
                      label="Access Token"
                      description="Token de acesso permanente gerado no Meta Business Suite"
                      value={metaToken}
                      onChange={(v) => { setMetaToken(v); mark(); }}
                      placeholder="EAAGm..."
                    />
                    <SecretField
                      label="Webhook Verify Token"
                      description="Token de verificação configurado no webhook do Meta"
                      value={metaWebhook}
                      onChange={(v) => { setMetaWebhook(v); mark(); }}
                      placeholder="meu_token_secreto"
                    />

                    {/* Webhook URL helper */}
                    {metaPhoneId && (
                      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 space-y-1.5">
                        <p className="text-xs font-semibold text-blue-700">URL do Webhook</p>
                        <p className="text-xs text-blue-600 font-mono break-all select-all">
                          {typeof window !== "undefined" ? window.location.origin : "https://seu-dominio.com"}/api/webhooks/whatsapp
                        </p>
                        <p className="text-[11px] text-blue-500">Configure esta URL no painel do Meta Business → WhatsApp → Configurações</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <PlainField
                      label="Instance ID"
                      description="ID da instância no painel da Z-API"
                      value={zapiInstanceId}
                      onChange={(v) => { setZapiInstanceId(v); mark(); }}
                      placeholder="3ABCD..."
                    />
                    <SecretField
                      label="Token"
                      description="Token da instância Z-API"
                      value={zapiToken}
                      onChange={(v) => { setZapiToken(v); mark(); }}
                      placeholder="F3Bx..."
                    />
                    <SecretField
                      label="Security Token (Client-Token)"
                      description="Token de segurança opcional para validar webhooks"
                      value={zapiSecurity}
                      onChange={(v) => { setZapiSecurity(v); mark(); }}
                      placeholder="Fs6..."
                    />
                  </div>
                )}
              </div>

              {/* Feedback messages */}
              {(waStatus === "ok" || waStatus === "error") && !dirty && (
                <div className={cn(
                  "flex items-start gap-2 px-4 py-3 rounded-xl text-sm border",
                  waStatus === "ok"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-red-50 border-red-200 text-red-700"
                )}>
                  {waStatus === "ok"
                    ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    : <AlertCircle  className="w-4 h-4 mt-0.5 shrink-0" />}
                  <span>{waStatus === "ok" ? `Conexão estabelecida. ${waStatusMsg}` : waStatusMsg}</span>
                </div>
              )}

              {saveMsg && (
                <div className={cn(
                  "flex items-center gap-2 px-4 py-3 rounded-xl text-sm border",
                  saveMsg.type === "ok"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-red-50 border-red-200 text-red-700"
                )}>
                  {saveMsg.type === "ok" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{saveMsg.text}</span>
                </div>
              )}

              {dirty && !saveMsg && (
                <p className="text-xs text-amber-600 font-medium flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                  Alterações não salvas
                </p>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-1">
                <Button
                  variant="outline" size="sm"
                  onClick={handleTest}
                  disabled={testing || saving || !waHasAny}
                >
                  {testing
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Testando...</>
                    : <><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Testar Conexão</>}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || testing || !dirty}
                >
                  {saving
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Salvando...</>
                    : <><Save className="w-3.5 h-3.5 mr-1.5" />Salvar</>}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Placeholder para futuras integrações ──────────────────────────── */}
        {[
          { name: "ERP Externo / SAP", desc: "Sincronização de pedidos e estoque", icon: "🔄", coming: true },
          { name: "Transportadoras",   desc: "Rastreamento e cotação de frete",    icon: "🚚", coming: true },
          { name: "NF-e / SEFAZ",      desc: "Emissão e consulta de notas fiscais",icon: "📄", coming: true },
        ].map((item) => (
          <div key={item.name} className="bg-white rounded-2xl border border-gray-200 border-dashed">
            <div className="flex items-center gap-4 px-5 py-4 opacity-50 cursor-not-allowed">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 text-lg">
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-700 text-sm">{item.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
              </div>
              <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-400 shrink-0">
                Em breve
              </span>
            </div>
          </div>
        ))}

      </div>
    </div>
  );
}
