"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Loader2, Save, Eye, EyeOff, CheckCircle2, AlertCircle,
  RefreshCw, MessageCircle, Wifi, WifiOff, HelpCircle,
} from "lucide-react";

type Provider   = "evolution" | "meta" | "zapi";
type ConnStatus = "idle" | "checking" | "ok" | "error" | "unconfigured";

const PROVIDERS: { id: Provider; label: string; sub: string }[] = [
  { id: "evolution", label: "Evolution API",  sub: "Self-hosted · recomendado" },
  { id: "meta",      label: "Meta Cloud API", sub: "Oficial · WhatsApp Business" },
  { id: "zapi",      label: "Z-API",          sub: "Terceiros · instância própria" },
];

function StatusPill({ status, msg }: { status: ConnStatus; msg?: string }) {
  if (status === "checking") return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
      <Loader2 className="w-3 h-3 animate-spin" /> Verificando...
    </span>
  );
  if (status === "ok") return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-success/15 text-success" title={msg}>
      <Wifi className="w-3 h-3" /> Conectado
    </span>
  );
  if (status === "error") return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-danger/15 text-danger" title={msg}>
      <WifiOff className="w-3 h-3" /> Erro de conexão
    </span>
  );
  if (status === "unconfigured") return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
      <HelpCircle className="w-3 h-3" /> Não configurado
    </span>
  );
  return null;
}

function SecretField({ label, description, value, onChange, placeholder }: {
  label: string; description?: string; value: string;
  onChange: (v: string) => void; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {description && <p className="text-[11px] text-muted-foreground leading-tight">{description}</p>}
      <div className="relative">
        <Input type={show ? "text" : "password"} value={value}
          onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className="pr-10 h-9 text-sm font-mono" />
        {value && (
          <button type="button" onClick={() => setShow((p) => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground" tabIndex={-1}>
            {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}

function PlainField({ label, description, value, onChange, placeholder }: {
  label: string; description?: string; value: string;
  onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {description && <p className="text-[11px] text-muted-foreground leading-tight">{description}</p>}
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="h-9 text-sm font-mono" />
    </div>
  );
}

export default function WhatsAppIntegracaoPage() {
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [testing,  setTesting]  = useState(false);
  const [dirty,    setDirty]    = useState(false);
  const [saveMsg,  setSaveMsg]  = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [status,   setStatus]   = useState<ConnStatus>("idle");
  const [statusMsg, setStatusMsg] = useState("");

  const [provider,       setProvider]       = useState<Provider>("evolution");
  const [evoUrl,         setEvoUrl]         = useState("");
  const [evoInstance,    setEvoInstance]    = useState("");
  const [evoApiKey,      setEvoApiKey]      = useState("");
  const [metaPhoneId,    setMetaPhoneId]    = useState("");
  const [metaToken,      setMetaToken]      = useState("");
  const [metaWebhook,    setMetaWebhook]    = useState("");
  const [zapiInstanceId, setZapiInstanceId] = useState("");
  const [zapiToken,      setZapiToken]      = useState("");
  const [zapiSecurity,   setZapiSecurity]   = useState("");

  function mark() { setDirty(true); setSaveMsg(null); }

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await fetch("/api/configuracoes/integracoes").then((r) => r.json());
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

      const hasCreds =
        prov === "evolution" ? !!(cfg.wa_evolution_url && cfg.wa_evolution_instance && cfg.wa_evolution_apikey) :
        prov === "meta"      ? !!(cfg.wa_meta_phone_id && cfg.wa_meta_access_token) :
                               !!(cfg.wa_zapi_instance_id && cfg.wa_zapi_token);
      if (!hasCreds) {
        setStatus("unconfigured");
      } else {
        checkStatus();
      }
    } catch {
      setStatus("unconfigured");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  useEffect(() => { loadConfig(); }, [loadConfig]);

  async function checkStatus() {
    setStatus("checking"); setStatusMsg("");
    try {
      const res = await fetch("/api/configuracoes/integracoes/status");
      const d   = await res.json() as { connected: boolean; reason?: string };
      setStatus(d.connected ? "ok" : "error");
      setStatusMsg(d.reason ?? "");
    } catch {
      setStatus("error");
      setStatusMsg("Sem resposta do servidor");
    }
  }

  async function handleTest() {
    setTesting(true);
    await checkStatus();
    setTesting(false);
  }

  async function handleSave() {
    setSaving(true); setSaveMsg(null);
    try {
      const body: Record<string, string | null> = {
        wa_provider:            provider,
        wa_evolution_url:       evoUrl.trim()        || null,
        wa_evolution_instance:  evoInstance.trim()   || null,
        wa_evolution_apikey:    evoApiKey.trim()      || null,
        wa_meta_phone_id:       metaPhoneId.trim()   || null,
        wa_meta_access_token:   metaToken.trim()      || null,
        wa_meta_webhook_token:  metaWebhook.trim()    || null,
        wa_zapi_instance_id:    zapiInstanceId.trim() || null,
        wa_zapi_token:          zapiToken.trim()       || null,
        wa_zapi_security_token: zapiSecurity.trim()    || null,
      };
      const res = await fetch("/api/configuracoes/integracoes", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) { setSaveMsg({ type: "err", text: (await res.json()).error || "Erro ao salvar" }); return; }
      setSaveMsg({ type: "ok", text: "Configurações salvas com sucesso!" });
      setDirty(false);
      checkStatus();
    } catch {
      setSaveMsg({ type: "err", text: "Erro de conexão." });
    } finally {
      setSaving(false);
    }
  }

  // O segredo (env WA_WEBHOOK_SECRET) precisa ir na URL registrada no provedor —
  // o webhook recusa chamadas sem ele. Substitua o placeholder pelo valor real.
  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/webhooks/whatsapp?secret=SEU_WA_WEBHOOK_SECRET`
    : "https://seu-dominio.com/api/webhooks/whatsapp?secret=SEU_WA_WEBHOOK_SECRET";

  const providerLabel = PROVIDERS.find((p) => p.id === provider)?.label ?? provider;

  if (loading) return (
    <div className="px-8 pt-8 text-muted-foreground flex items-center gap-2 text-sm">
      <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
    </div>
  );

  return (
    <div>
      <PageHeader
        title="WhatsApp Business"
        breadcrumbs={[
          { label: "Configurações" },
          { label: "Integrações", href: "/configuracoes/integracoes" },
          { label: "WhatsApp" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-[10px] font-medium px-2 py-0.5 rounded-full border",
              provider === "evolution" ? "bg-success/10 text-success border-success/30" :
              provider === "meta"      ? "bg-info/10 text-info border-info/20" :
                                        "bg-purple-50 text-purple-600 border-purple-100"
            )}>
              {providerLabel}
            </span>
            <StatusPill status={status} msg={statusMsg} />
            <Button variant="outline" size="sm" onClick={handleTest} disabled={testing || saving}>
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
        }
      />

      <div className="px-8 pb-8 max-w-2xl space-y-6">

        {/* Provider selector */}
        <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Provedor</p>
          <div className="grid grid-cols-3 gap-2">
            {PROVIDERS.map((p) => (
              <button key={p.id} type="button"
                onClick={() => { setProvider(p.id); mark(); }}
                className={cn(
                  "flex flex-col items-start gap-0.5 px-4 py-3 rounded-xl border-2 text-left transition-colors",
                  provider === p.id ? "border-blue-500 bg-info/10" : "border-border hover:border-border bg-card"
                )}
              >
                <span className={cn("text-sm font-semibold", provider === p.id ? "text-info" : "text-foreground")}>
                  {p.label}
                </span>
                <span className="text-[11px] text-muted-foreground">{p.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Credentials */}
        <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Credenciais</p>

          {provider === "evolution" && (
            <div className="space-y-3">
              <PlainField label="URL do Servidor"
                description="URL base da sua instância Evolution API (ex: https://evo.meudominio.com)"
                value={evoUrl} onChange={(v) => { setEvoUrl(v); mark(); }} placeholder="https://evo.meudominio.com" />
              <PlainField label="Nome da Instância"
                description="Nome exato da instância criada no painel da Evolution API"
                value={evoInstance} onChange={(v) => { setEvoInstance(v); mark(); }} placeholder="minha-instancia" />
              <SecretField label="API Key"
                description="Chave de autenticação global configurada no AUTHENTICATION_API_KEY"
                value={evoApiKey} onChange={(v) => { setEvoApiKey(v); mark(); }} placeholder="sua-api-key" />

              {evoUrl && evoInstance && (
                <div className="bg-success/10 border border-emerald-100 rounded-xl px-4 py-3 space-y-2">
                  <p className="text-xs font-semibold text-success">Configurar Webhook na Evolution API</p>
                  <p className="text-[11px] text-success">
                    Em <strong>Instâncias → {evoInstance} → Webhook</strong>, configure:
                  </p>
                  <p className="text-[11px] text-success font-medium">URL:</p>
                  <p className="text-xs text-success font-mono break-all bg-card/60 px-3 py-1.5 rounded-lg border border-success/30 select-all">
                    {webhookUrl}
                  </p>
                  <p className="text-[11px] text-success">
                    Troque <strong>SEU_WA_WEBHOOK_SECRET</strong> pelo valor da variável <strong>WA_WEBHOOK_SECRET</strong> (Vercel).
                  </p>
                  <p className="text-[11px] text-success">Evento: <strong>MESSAGES_UPSERT</strong></p>
                </div>
              )}
            </div>
          )}

          {provider === "meta" && (
            <div className="space-y-3">
              <PlainField label="Phone Number ID"
                description="ID do número de telefone no painel do Meta Business"
                value={metaPhoneId} onChange={(v) => { setMetaPhoneId(v); mark(); }} placeholder="1234567890" />
              <SecretField label="Access Token"
                description="Token de acesso permanente gerado no Meta Business Suite"
                value={metaToken} onChange={(v) => { setMetaToken(v); mark(); }} placeholder="EAAGm..." />
              <SecretField label="Webhook Verify Token"
                description="Token de verificação configurado no webhook do Meta"
                value={metaWebhook} onChange={(v) => { setMetaWebhook(v); mark(); }} placeholder="meu_token_secreto" />
              {metaPhoneId && (
                <div className="bg-info/10 border border-info/20 rounded-xl px-4 py-3 space-y-1.5">
                  <p className="text-xs font-semibold text-info">URL do Webhook</p>
                  <p className="text-xs text-info font-mono break-all select-all">{webhookUrl}</p>
                  <p className="text-[11px] text-blue-500">
                    Troque <strong>SEU_WA_WEBHOOK_SECRET</strong> pelo valor da variável <strong>WA_WEBHOOK_SECRET</strong> (Vercel).
                  </p>
                  <p className="text-[11px] text-blue-500">Configure no Meta Business → WhatsApp → Configurações</p>
                </div>
              )}
            </div>
          )}

          {provider === "zapi" && (
            <div className="space-y-3">
              <PlainField label="Instance ID"
                description="ID da instância no painel da Z-API"
                value={zapiInstanceId} onChange={(v) => { setZapiInstanceId(v); mark(); }} placeholder="3ABCD..." />
              <SecretField label="Token"
                description="Token da instância Z-API"
                value={zapiToken} onChange={(v) => { setZapiToken(v); mark(); }} placeholder="F3Bx..." />
              <SecretField label="Security Token (Client-Token)"
                description="Token de segurança opcional para validar webhooks"
                value={zapiSecurity} onChange={(v) => { setZapiSecurity(v); mark(); }} placeholder="Fs6..." />
            </div>
          )}
        </div>

        {/* Status / save feedback */}
        {(status === "ok" || status === "error") && !dirty && (
          <div className={cn(
            "flex items-start gap-2 px-4 py-3 rounded-xl text-sm border",
            status === "ok" ? "bg-success/10 border-success/30 text-success" : "bg-danger/10 border-danger/30 text-danger"
          )}>
            {status === "ok" ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
            <span>{status === "ok" ? `Conexão estabelecida. ${statusMsg}` : statusMsg}</span>
          </div>
        )}

        {saveMsg && (
          <div className={cn(
            "flex items-center gap-2 px-4 py-3 rounded-xl text-sm border",
            saveMsg.type === "ok" ? "bg-success/10 border-success/30 text-success" : "bg-danger/10 border-danger/30 text-danger"
          )}>
            {saveMsg.type === "ok" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{saveMsg.text}</span>
          </div>
        )}

        {dirty && !saveMsg && (
          <p className="text-xs text-warning font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
            Alterações não salvas — clique em Salvar para confirmar
          </p>
        )}
      </div>
    </div>
  );
}
