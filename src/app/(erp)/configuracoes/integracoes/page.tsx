"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Loader2, Save, Eye, EyeOff, CheckCircle2, AlertCircle,
  RefreshCw, ChevronDown, MessageCircle, Wifi, WifiOff, HelpCircle, Database, Send,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Provider   = "evolution" | "meta" | "zapi";
type ConnStatus = "idle" | "checking" | "ok" | "error" | "unconfigured";

type Config = {
  wa_provider:            string | null;
  // Evolution API
  wa_evolution_url:       string | null;
  wa_evolution_instance:  string | null;
  wa_evolution_apikey:    string | null;
  // Meta
  wa_meta_phone_id:       string | null;
  wa_meta_access_token:   string | null;
  wa_meta_webhook_token:  string | null;
  // Z-API
  wa_zapi_instance_id:    string | null;
  wa_zapi_token:          string | null;
  wa_zapi_security_token: string | null;
  // DB Engeman
  db_engeman_host:        string | null;
  db_engeman_name:        string | null;
  db_engeman_user:        string | null;
  db_engeman_password:    string | null;
  // Telegram
  tg_bot_token:           string | null;
  tg_chat_id:             string | null;
};

const PROVIDERS: { id: Provider; label: string; sub: string }[] = [
  { id: "evolution", label: "Evolution API", sub: "Self-hosted · recomendado" },
  { id: "meta",      label: "Meta Cloud API", sub: "Oficial · WhatsApp Business" },
  { id: "zapi",      label: "Z-API",          sub: "Terceiros · instância própria" },
];

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
          <button type="button" onClick={() => setShow((p) => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" tabIndex={-1}>
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
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [dirty,   setDirty]   = useState(false);

  // WhatsApp state
  const [waStatus,    setWaStatus]    = useState<ConnStatus>("idle");
  const [waStatusMsg, setWaStatusMsg] = useState("");
  const [waOpen,      setWaOpen]      = useState(false);
  const [provider,    setProvider]    = useState<Provider>("evolution");

  // Evolution API
  const [evoUrl,      setEvoUrl]      = useState("");
  const [evoInstance, setEvoInstance] = useState("");
  const [evoApiKey,   setEvoApiKey]   = useState("");

  // Meta
  const [metaPhoneId, setMetaPhoneId] = useState("");
  const [metaToken,   setMetaToken]   = useState("");
  const [metaWebhook, setMetaWebhook] = useState("");

  // Z-API
  const [zapiInstanceId, setZapiInstanceId] = useState("");
  const [zapiToken,      setZapiToken]      = useState("");
  const [zapiSecurity,   setZapiSecurity]   = useState("");

  // Telegram
  const [tgOpen,          setTgOpen]          = useState(false);
  const [tgBotToken,      setTgBotToken]      = useState("");
  const [tgChatId,        setTgChatId]        = useState("");
  const [tgStatus,        setTgStatus]        = useState<ConnStatus>("idle");
  const [tgStatusMsg,     setTgStatusMsg]     = useState("");
  const [tgDirty,         setTgDirty]         = useState(false);
  const [tgSaving,        setTgSaving]        = useState(false);
  const [tgTesting,       setTgTesting]       = useState(false);
  const [tgSaveMsg,       setTgSaveMsg]       = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [tgWebhookUrl,    setTgWebhookUrl]    = useState<string | null>(null);
  const [tgWebhookLoading, setTgWebhookLoading] = useState(false);
  const [tgWebhookMsg,    setTgWebhookMsg]    = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // DB Engeman
  const [dbEngemanOpen,     setDbEngemanOpen]     = useState(false);
  const [dbEngemanHost,     setDbEngemanHost]     = useState("");
  const [dbEngemanName,     setDbEngemanName]     = useState("");
  const [dbEngemanUser,     setDbEngemanUser]     = useState("");
  const [dbEngemanPassword, setDbEngemanPassword] = useState("");
  const [dbEngemanStatus,   setDbEngemanStatus]   = useState<ConnStatus>("idle");
  const [dbEngemanDirty,    setDbEngemanDirty]    = useState(false);
  const [dbEngemanSaving,   setDbEngemanSaving]   = useState(false);
  const [dbEngemanSaveMsg,  setDbEngemanSaveMsg]  = useState<{ type: "ok" | "err"; text: string } | null>(null);

  function mark() { setDirty(true); setSaveMsg(null); }
  function markDb() { setDbEngemanDirty(true); setDbEngemanSaveMsg(null); }
  function markTg() { setTgDirty(true); setTgSaveMsg(null); }

  // ── Load ─────────────────────────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const cfg: Config = await fetch("/api/configuracoes/integracoes").then((r) => r.json());
      const prov = (cfg.wa_provider as Provider) ?? "evolution";
      setProvider(prov);
      setEvoUrl(cfg.wa_evolution_url ?? "");
      setEvoInstance(cfg.wa_evolution_instance ?? "");
      setEvoApiKey(cfg.wa_evolution_apikey ?? "");
      setMetaPhoneId(cfg.wa_meta_phone_id ?? "");
      setMetaToken(cfg.wa_meta_access_token ?? "");
      setMetaWebhook(cfg.wa_meta_webhook_token ?? "");
      setZapiInstanceId(cfg.wa_zapi_instance_id ?? "");
      setZapiToken(cfg.wa_zapi_token ?? "");
      setZapiSecurity(cfg.wa_zapi_security_token ?? "");

      // Engeman
      setDbEngemanHost(cfg.db_engeman_host ?? "");
      setDbEngemanName(cfg.db_engeman_name ?? "");
      setDbEngemanUser(cfg.db_engeman_user ?? "");
      setDbEngemanPassword(cfg.db_engeman_password ?? "");
      const hasEngeman = !!(cfg.db_engeman_host && cfg.db_engeman_name && cfg.db_engeman_user);
      setDbEngemanStatus(hasEngeman ? "ok" : "unconfigured");

      // Telegram
      setTgBotToken(cfg.tg_bot_token ?? "");
      setTgChatId(cfg.tg_chat_id ?? "");
      const hasTg = !!(cfg.tg_bot_token && cfg.tg_chat_id);
      setTgStatus(hasTg ? "ok" : "unconfigured");

      const hasCreds =
        prov === "evolution" ? !!(cfg.wa_evolution_url && cfg.wa_evolution_instance && cfg.wa_evolution_apikey) :
        prov === "meta"      ? !!(cfg.wa_meta_phone_id && cfg.wa_meta_access_token) :
                               !!(cfg.wa_zapi_instance_id && cfg.wa_zapi_token);

      if (!hasCreds) {
        setWaStatus("unconfigured");
      } else {
        checkStatus();
      }
    } catch {
      setWaStatus("unconfigured");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // ── Check connection (server-side proxy — avoids CORS) ───────────────────────
  async function checkStatus() {
    setWaStatus("checking"); setWaStatusMsg("");
    try {
      const res = await fetch("/api/configuracoes/integracoes/status");
      const d   = await res.json() as { connected: boolean; reason?: string };
      setWaStatus(d.connected ? "ok" : "error");
      setWaStatusMsg(d.reason ?? "");
    } catch {
      setWaStatus("error");
      setWaStatusMsg("Sem resposta do servidor");
    }
  }

  // ── Test ─────────────────────────────────────────────────────────────────────
  async function handleTest() {
    setTesting(true);
    await checkStatus();
    setTesting(false);
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true); setSaveMsg(null);
    try {
      const body: Record<string, string | null> = {
        wa_provider:            provider,
        wa_evolution_url:       evoUrl.trim()       || null,
        wa_evolution_instance:  evoInstance.trim()  || null,
        wa_evolution_apikey:    evoApiKey.trim()     || null,
        wa_meta_phone_id:       metaPhoneId.trim()  || null,
        wa_meta_access_token:   metaToken.trim()     || null,
        wa_meta_webhook_token:  metaWebhook.trim()   || null,
        wa_zapi_instance_id:    zapiInstanceId.trim() || null,
        wa_zapi_token:          zapiToken.trim()      || null,
        wa_zapi_security_token: zapiSecurity.trim()   || null,
      };
      const res = await fetch("/api/configuracoes/integracoes", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) { setSaveMsg({ type: "err", text: (await res.json()).error || "Erro ao salvar" }); return; }
      setSaveMsg({ type: "ok", text: "Configurações salvas!" });
      setDirty(false);
      checkStatus();
    } catch {
      setSaveMsg({ type: "err", text: "Erro de conexão." });
    } finally {
      setSaving(false);
    }
  }

  // ── Save Engeman ─────────────────────────────────────────────────────────────
  async function handleSaveEngeman() {
    setDbEngemanSaving(true); setDbEngemanSaveMsg(null);
    try {
      const res = await fetch("/api/configuracoes/integracoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          db_engeman_host:     dbEngemanHost.trim()     || null,
          db_engeman_name:     dbEngemanName.trim()     || null,
          db_engeman_user:     dbEngemanUser.trim()     || null,
          db_engeman_password: dbEngemanPassword.trim() || null,
        }),
      });
      if (!res.ok) {
        setDbEngemanSaveMsg({ type: "err", text: (await res.json()).error || "Erro ao salvar" });
        return;
      }
      setDbEngemanSaveMsg({ type: "ok", text: "Credenciais salvas com sucesso!" });
      setDbEngemanDirty(false);
      const hasAll = !!(dbEngemanHost && dbEngemanName && dbEngemanUser);
      setDbEngemanStatus(hasAll ? "ok" : "unconfigured");
    } catch {
      setDbEngemanSaveMsg({ type: "err", text: "Erro de conexão." });
    } finally {
      setDbEngemanSaving(false);
    }
  }

  // ── Save Telegram ─────────────────────────────────────────────────────────────
  async function handleSaveTelegram() {
    setTgSaving(true); setTgSaveMsg(null);
    try {
      const res = await fetch("/api/configuracoes/integracoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tg_bot_token: tgBotToken.trim() || null,
          tg_chat_id:   tgChatId.trim()   || null,
        }),
      });
      if (!res.ok) {
        setTgSaveMsg({ type: "err", text: (await res.json()).error || "Erro ao salvar" });
        return;
      }
      setTgSaveMsg({ type: "ok", text: "Credenciais salvas!" });
      setTgDirty(false);
      setTgStatus(!!(tgBotToken && tgChatId) ? "ok" : "unconfigured");
    } catch {
      setTgSaveMsg({ type: "err", text: "Erro de conexão." });
    } finally {
      setTgSaving(false);
    }
  }

  async function handleTestTelegram() {
    setTgTesting(true); setTgStatusMsg("");
    try {
      const res = await fetch("/api/configuracoes/integracoes/telegram-status");
      const d   = await res.json() as { connected: boolean; reason?: string };
      setTgStatus(d.connected ? "ok" : "error");
      setTgStatusMsg(d.reason ?? "");
    } catch {
      setTgStatus("error");
      setTgStatusMsg("Sem resposta do servidor");
    } finally {
      setTgTesting(false);
    }
  }

  async function loadTgWebhook() {
    try {
      const res = await fetch("/api/configuracoes/integracoes/telegram-webhook");
      const d   = await res.json() as { ok: boolean; url?: string; error?: string };
      if (d.ok) setTgWebhookUrl(d.url ?? null);
    } catch { /* ignore */ }
  }

  async function handleRegisterTgWebhook() {
    setTgWebhookLoading(true); setTgWebhookMsg(null);
    try {
      const res = await fetch("/api/configuracoes/integracoes/telegram-webhook", { method: "POST" });
      const d   = await res.json() as { ok?: boolean; webhookUrl?: string; error?: string };
      if (!res.ok || !d.ok) {
        setTgWebhookMsg({ type: "err", text: d.error ?? "Erro ao registrar webhook" });
      } else {
        setTgWebhookUrl(d.webhookUrl ?? null);
        setTgWebhookMsg({ type: "ok", text: "Webhook registrado com sucesso!" });
      }
    } catch {
      setTgWebhookMsg({ type: "err", text: "Erro de conexão." });
    } finally {
      setTgWebhookLoading(false);
    }
  }

  const providerLabel = PROVIDERS.find((p) => p.id === provider)?.label ?? provider;
  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/webhooks/whatsapp`
    : "https://seu-dominio.com/api/webhooks/whatsapp";

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
          {/* Row header */}
          <button
            type="button"
            onClick={() => setWaOpen((p) => !p)}
            className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50/60 transition-colors rounded-2xl"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
              <MessageCircle className="w-5 h-5 text-emerald-600" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-gray-900 text-sm">WhatsApp Business</p>
                <span className={cn(
                  "text-[10px] font-medium px-2 py-0.5 rounded-full border",
                  provider === "evolution" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                  provider === "meta"      ? "bg-blue-50 text-blue-600 border-blue-100" :
                                            "bg-purple-50 text-purple-600 border-purple-100"
                )}>
                  {providerLabel}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Mensagens e aprovações de Solicitações de Compra via WhatsApp
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <StatusPill status={waStatus} msg={waStatusMsg} />
              {waStatus === "ok" && waStatusMsg && (
                <span className="text-xs text-gray-400 hidden sm:block max-w-[160px] truncate" title={waStatusMsg}>
                  {waStatusMsg}
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  checkStatus();
                }}
                className="p-1.5 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
                title="Verificar conexão"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform duration-200", waOpen && "rotate-180")} />
            </div>
          </button>

          {/* Expanded */}
          {waOpen && (
            <div className="px-5 pb-5 space-y-5 border-t border-gray-100">
              <div className="pt-4" />

              {/* Provider selector */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Provedor</p>
                <div className="grid grid-cols-3 gap-2">
                  {PROVIDERS.map((p) => (
                    <button
                      key={p.id} type="button"
                      onClick={() => { setProvider(p.id); mark(); }}
                      className={cn(
                        "flex flex-col items-start gap-0.5 px-4 py-3 rounded-xl border-2 text-left transition-colors",
                        provider === p.id
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300 bg-white"
                      )}
                    >
                      <span className={cn("text-sm font-semibold", provider === p.id ? "text-blue-700" : "text-gray-700")}>
                        {p.label}
                      </span>
                      <span className="text-[11px] text-gray-400">{p.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Credentials */}
              <div className="space-y-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Credenciais de Acesso</p>

                {provider === "evolution" && (
                  <div className="space-y-3">
                    <PlainField
                      label="URL do Servidor"
                      description="URL base da sua instância Evolution API (ex: https://evo.meudominio.com)"
                      value={evoUrl}
                      onChange={(v) => { setEvoUrl(v); mark(); }}
                      placeholder="https://evo.meudominio.com"
                    />
                    <PlainField
                      label="Nome da Instância"
                      description="Nome exato da instância criada no painel da Evolution API"
                      value={evoInstance}
                      onChange={(v) => { setEvoInstance(v); mark(); }}
                      placeholder="minha-instancia"
                    />
                    <SecretField
                      label="API Key"
                      description="Chave de autenticação global configurada no AUTHENTICATION_API_KEY"
                      value={evoApiKey}
                      onChange={(v) => { setEvoApiKey(v); mark(); }}
                      placeholder="sua-api-key"
                    />

                    {/* Webhook helper */}
                    {evoUrl && evoInstance && (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 space-y-2">
                        <p className="text-xs font-semibold text-emerald-700">Configurar Webhook na Evolution API</p>
                        <p className="text-[11px] text-emerald-600">
                          No painel da Evolution API, em <strong>Instâncias → {evoInstance} → Webhook</strong>, configure:
                        </p>
                        <div className="space-y-1">
                          <p className="text-[11px] text-emerald-600 font-medium">URL:</p>
                          <p className="text-xs text-emerald-700 font-mono break-all bg-white/60 px-3 py-1.5 rounded-lg border border-emerald-200 select-all">
                            {webhookUrl}
                          </p>
                        </div>
                        <p className="text-[11px] text-emerald-600">
                          Evento necessário: <strong>MESSAGES_UPSERT</strong>
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {provider === "meta" && (
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
                    {metaPhoneId && (
                      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 space-y-1.5">
                        <p className="text-xs font-semibold text-blue-700">URL do Webhook</p>
                        <p className="text-xs text-blue-600 font-mono break-all select-all">{webhookUrl}</p>
                        <p className="text-[11px] text-blue-500">Configure esta URL no painel do Meta Business → WhatsApp → Configurações</p>
                      </div>
                    )}
                  </div>
                )}

                {provider === "zapi" && (
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

              {/* Status feedback */}
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
                  disabled={testing || saving}
                >
                  {testing
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Testando...</>
                    : <><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Testar Conexão</>}
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving || testing || !dirty}>
                  {saving
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Salvando...</>
                    : <><Save className="w-3.5 h-3.5 mr-1.5" />Salvar</>}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── DB Engeman ───────────────────────────────────────────────────── */}
        <div className={cn(
          "bg-white rounded-2xl border transition-all duration-200",
          dbEngemanOpen ? "border-gray-300 shadow-sm" : "border-gray-200"
        )}>
          <button
            type="button"
            onClick={() => setDbEngemanOpen((p) => !p)}
            className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50/60 transition-colors rounded-2xl"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
              <Database className="w-5 h-5 text-blue-600" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-gray-900 text-sm">DB Engeman Slave</p>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-blue-50 text-blue-600 border-blue-100">
                  SQL Server
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Acesso somente leitura ao banco de dados do Engeman (manutenção)
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <StatusPill status={dbEngemanStatus} />
              <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform duration-200", dbEngemanOpen && "rotate-180")} />
            </div>
          </button>

          {dbEngemanOpen && (
            <div className="px-5 pb-5 space-y-4 border-t border-gray-100">
              <div className="pt-4" />

              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Conexão</p>
                <div className="grid grid-cols-2 gap-3">
                  <PlainField
                    label="Host / IP"
                    description="Endereço do servidor SQL Server"
                    value={dbEngemanHost}
                    onChange={(v) => { setDbEngemanHost(v); markDb(); }}
                    placeholder="192.168.0.206"
                  />
                  <PlainField
                    label="Banco de Dados"
                    value={dbEngemanName}
                    onChange={(v) => { setDbEngemanName(v); markDb(); }}
                    placeholder="ENGEMAN_SLAVE"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Autenticação</p>
                <div className="grid grid-cols-2 gap-3">
                  <PlainField
                    label="Usuário"
                    value={dbEngemanUser}
                    onChange={(v) => { setDbEngemanUser(v); markDb(); }}
                    placeholder="sa"
                  />
                  <SecretField
                    label="Senha"
                    value={dbEngemanPassword}
                    onChange={(v) => { setDbEngemanPassword(v); markDb(); }}
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {dbEngemanSaveMsg && (
                <div className={cn(
                  "flex items-center gap-2 px-4 py-3 rounded-xl text-sm border",
                  dbEngemanSaveMsg.type === "ok"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-red-50 border-red-200 text-red-700"
                )}>
                  {dbEngemanSaveMsg.type === "ok"
                    ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                    : <AlertCircle  className="w-4 h-4 shrink-0" />}
                  <span>{dbEngemanSaveMsg.text}</span>
                </div>
              )}

              {dbEngemanDirty && !dbEngemanSaveMsg && (
                <p className="text-xs text-amber-600 font-medium flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                  Alterações não salvas
                </p>
              )}

              <div className="flex justify-end pt-1">
                <Button
                  size="sm"
                  onClick={handleSaveEngeman}
                  disabled={dbEngemanSaving || !dbEngemanDirty}
                >
                  {dbEngemanSaving
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Salvando...</>
                    : <><Save className="w-3.5 h-3.5 mr-1.5" />Salvar</>}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Telegram ─────────────────────────────────────────────────────── */}
        <div className={cn(
          "bg-white rounded-2xl border transition-all duration-200",
          tgOpen ? "border-gray-300 shadow-sm" : "border-gray-200"
        )}>
          <button
            type="button"
            onClick={() => { setTgOpen((p) => { if (!p) loadTgWebhook(); return !p; }); }}
            className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50/60 transition-colors rounded-2xl"
          >
            <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center shrink-0">
              <Send className="w-5 h-5 text-sky-500" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-gray-900 text-sm">Telegram</p>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-sky-50 text-sky-600 border-sky-100">
                  Bot API
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Notificações e aprovações via bot do Telegram
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <StatusPill status={tgStatus} msg={tgStatusMsg} />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleTestTelegram(); }}
                className="p-1.5 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
                title="Verificar conexão"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform duration-200", tgOpen && "rotate-180")} />
            </div>
          </button>

          {tgOpen && (
            <div className="px-5 pb-5 space-y-5 border-t border-gray-100">
              <div className="pt-4" />

              {/* How to create a bot */}
              <div className="bg-sky-50 border border-sky-100 rounded-xl px-4 py-3 space-y-1.5 text-xs text-sky-700">
                <p className="font-semibold">Como configurar</p>
                <ol className="list-decimal list-inside space-y-1 text-sky-600 leading-relaxed">
                  <li>Abra o Telegram e busque por <strong>@BotFather</strong></li>
                  <li>Envie <strong>/newbot</strong> e siga as instruções para criar o bot</li>
                  <li>Copie o <strong>token</strong> fornecido pelo BotFather</li>
                  <li>Adicione o bot ao grupo/canal desejado</li>
                  <li>Obtenha o <strong>Chat ID</strong> via <strong>@userinfobot</strong> ou pela URL da API</li>
                </ol>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Credenciais</p>
                <div className="space-y-3">
                  <SecretField
                    label="Bot Token"
                    description="Token gerado pelo @BotFather (ex: 123456789:AAFxxx...)"
                    value={tgBotToken}
                    onChange={(v) => { setTgBotToken(v); markTg(); }}
                    placeholder="123456789:AAF..."
                  />
                  <PlainField
                    label="Chat ID"
                    description="ID do grupo, canal ou chat privado que receberá as mensagens. Pode ser negativo para grupos (ex: -1001234567890)"
                    value={tgChatId}
                    onChange={(v) => { setTgChatId(v); markTg(); }}
                    placeholder="-1001234567890"
                  />
                </div>
              </div>

              {/* Status feedback */}
              {(tgStatus === "ok" || tgStatus === "error") && !tgDirty && (
                <div className={cn(
                  "flex items-start gap-2 px-4 py-3 rounded-xl text-sm border",
                  tgStatus === "ok"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-red-50 border-red-200 text-red-700"
                )}>
                  {tgStatus === "ok"
                    ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    : <AlertCircle  className="w-4 h-4 mt-0.5 shrink-0" />}
                  <span>{tgStatus === "ok" ? `Conexão estabelecida. ${tgStatusMsg}` : tgStatusMsg}</span>
                </div>
              )}

              {tgSaveMsg && (
                <div className={cn(
                  "flex items-center gap-2 px-4 py-3 rounded-xl text-sm border",
                  tgSaveMsg.type === "ok"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-red-50 border-red-200 text-red-700"
                )}>
                  {tgSaveMsg.type === "ok" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{tgSaveMsg.text}</span>
                </div>
              )}

              {tgDirty && !tgSaveMsg && (
                <p className="text-xs text-amber-600 font-medium flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                  Alterações não salvas
                </p>
              )}

              <div className="flex items-center justify-between pt-1">
                <Button
                  variant="outline" size="sm"
                  onClick={handleTestTelegram}
                  disabled={tgTesting || tgSaving || !tgBotToken || !tgChatId}
                >
                  {tgTesting
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Testando...</>
                    : <><Send className="w-3.5 h-3.5 mr-1.5" />Testar e Enviar Mensagem</>}
                </Button>
                <Button size="sm" onClick={handleSaveTelegram} disabled={tgSaving || tgTesting || !tgDirty}>
                  {tgSaving
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Salvando...</>
                    : <><Save className="w-3.5 h-3.5 mr-1.5" />Salvar</>}
                </Button>
              </div>

              {/* Webhook registration */}
              <div className="space-y-3 border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Webhook para Aprovações (Botões)</p>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Registre o webhook para que o bot receba as respostas dos botões ✅/❌ enviados ao aprovador.
                  Necessário para o fluxo de aprovação via DM.
                </p>

                {tgWebhookUrl && (
                  <div className="bg-sky-50 border border-sky-100 rounded-xl px-4 py-3 space-y-1">
                    <p className="text-[11px] font-semibold text-sky-700">Webhook registrado:</p>
                    <p className="text-xs text-sky-700 font-mono break-all select-all">{tgWebhookUrl}</p>
                  </div>
                )}

                {tgWebhookMsg && (
                  <div className={cn(
                    "flex items-center gap-2 px-4 py-3 rounded-xl text-sm border",
                    tgWebhookMsg.type === "ok"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : "bg-red-50 border-red-200 text-red-700"
                  )}>
                    {tgWebhookMsg.type === "ok"
                      ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                      : <AlertCircle  className="w-4 h-4 shrink-0" />}
                    <span>{tgWebhookMsg.text}</span>
                  </div>
                )}

                <div className="flex justify-start">
                  <Button
                    variant="outline" size="sm"
                    onClick={handleRegisterTgWebhook}
                    disabled={tgWebhookLoading || !tgBotToken}
                  >
                    {tgWebhookLoading
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Registrando...</>
                      : <><Wifi className="w-3.5 h-3.5 mr-1.5" />Registrar Webhook</>}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Futuras integrações ───────────────────────────────────────────── */}
        {[
          { name: "ERP Externo / SAP", desc: "Sincronização de pedidos e estoque",  icon: "🔄" },
          { name: "Transportadoras",   desc: "Rastreamento e cotação de frete",      icon: "🚚" },
          { name: "NF-e / SEFAZ",      desc: "Emissão e consulta de notas fiscais", icon: "📄" },
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
