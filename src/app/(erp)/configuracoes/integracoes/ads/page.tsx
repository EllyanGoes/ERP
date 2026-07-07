"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Loader2, Save, Eye, EyeOff, CheckCircle2, AlertCircle,
  Wifi, HelpCircle, Megaphone,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ConnStatus = "idle" | "ok" | "unconfigured";

function StatusPill({ status }: { status: ConnStatus }) {
  if (status === "ok") return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-success/15 text-success">
      <Wifi className="w-3 h-3" /> Configurado
    </span>
  );
  if (status === "unconfigured") return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
      <HelpCircle className="w-3 h-3" /> Não configurado
    </span>
  );
  return null;
}

function SecretField({
  label, description, value, onChange, placeholder,
}: {
  label: string; description?: string; value: string;
  onChange: (v: string) => void; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {description && <p className="text-[11px] text-muted-foreground leading-tight">{description}</p>}
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-10 h-9 text-sm font-mono"
        />
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

function TextField({
  label, description, value, onChange, placeholder,
}: {
  label: string; description?: string; value: string;
  onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {description && <p className="text-[11px] text-muted-foreground leading-tight">{description}</p>}
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 text-sm font-mono"
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdsIntegracaoPage() {
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [dirty,   setDirty]   = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [status,  setStatus]  = useState<ConnStatus>("idle");

  // Meta
  const [metaToken,   setMetaToken]   = useState("");
  const [metaAccount, setMetaAccount] = useState("");
  // Google
  const [gDevToken,     setGDevToken]     = useState("");
  const [gClientId,     setGClientId]     = useState("");
  const [gClientSecret, setGClientSecret] = useState("");
  const [gRefreshToken, setGRefreshToken] = useState("");
  const [gCustomerId,   setGCustomerId]   = useState("");
  // TikTok
  const [ttToken,      setTtToken]      = useState("");
  const [ttAdvertiser, setTtAdvertiser] = useState("");

  function mark() { setDirty(true); setSaveMsg(null); }

  // Alguma plataforma tem a credencial mínima para importar?
  function algumaConfigurada(v: {
    metaToken: string; metaAccount: string;
    gDevToken: string; gRefreshToken: string; gCustomerId: string;
    ttToken: string; ttAdvertiser: string;
  }): boolean {
    return (
      !!(v.metaToken && v.metaAccount) ||
      !!(v.gDevToken && v.gRefreshToken && v.gCustomerId) ||
      !!(v.ttToken && v.ttAdvertiser)
    );
  }

  // ── Load ───────────────────────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await fetch("/api/configuracoes/integracoes").then((r) => r.json());
      const vals = {
        metaToken:     cfg.ads_meta_access_token ?? "",
        metaAccount:   cfg.ads_meta_ad_account_id ?? "",
        gDevToken:     cfg.ads_google_developer_token ?? "",
        gClientId:     cfg.ads_google_client_id ?? "",
        gClientSecret: cfg.ads_google_client_secret ?? "",
        gRefreshToken: cfg.ads_google_refresh_token ?? "",
        gCustomerId:   cfg.ads_google_customer_id ?? "",
        ttToken:       cfg.ads_tiktok_access_token ?? "",
        ttAdvertiser:  cfg.ads_tiktok_advertiser_id ?? "",
      };
      setMetaToken(vals.metaToken);
      setMetaAccount(vals.metaAccount);
      setGDevToken(vals.gDevToken);
      setGClientId(vals.gClientId);
      setGClientSecret(vals.gClientSecret);
      setGRefreshToken(vals.gRefreshToken);
      setGCustomerId(vals.gCustomerId);
      setTtToken(vals.ttToken);
      setTtAdvertiser(vals.ttAdvertiser);
      setStatus(algumaConfigurada(vals) ? "ok" : "unconfigured");
    } catch {
      setStatus("unconfigured");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true); setSaveMsg(null);
    try {
      const res = await fetch("/api/configuracoes/integracoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ads_meta_access_token:      metaToken.trim()     || null,
          ads_meta_ad_account_id:     metaAccount.trim()   || null,
          ads_google_developer_token: gDevToken.trim()     || null,
          ads_google_client_id:       gClientId.trim()     || null,
          ads_google_client_secret:   gClientSecret.trim() || null,
          ads_google_refresh_token:   gRefreshToken.trim() || null,
          ads_google_customer_id:     gCustomerId.trim()   || null,
          ads_tiktok_access_token:    ttToken.trim()       || null,
          ads_tiktok_advertiser_id:   ttAdvertiser.trim()  || null,
        }),
      });
      if (!res.ok) {
        setSaveMsg({ type: "err", text: (await res.json()).error || "Erro ao salvar" });
        return;
      }
      setSaveMsg({ type: "ok", text: "Configurações salvas com sucesso!" });
      setDirty(false);
      setStatus(algumaConfigurada({
        metaToken, metaAccount, gDevToken, gRefreshToken, gCustomerId, ttToken, ttAdvertiser,
      }) ? "ok" : "unconfigured");
    } catch {
      setSaveMsg({ type: "err", text: "Erro de conexão." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="px-8 pt-8 text-muted-foreground flex items-center gap-2 text-sm">
      <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Plataformas de Anúncios"
        breadcrumbs={[
          { label: "Configurações" },
          { label: "Integrações", href: "/configuracoes/integracoes" },
          { label: "Plataformas de Anúncios" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <StatusPill status={status} />
            <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
              {saving
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Salvando...</>
                : <><Save className="w-3.5 h-3.5 mr-1.5" />Salvar</>}
            </Button>
          </div>
        }
      />

      <div className="px-8 pb-8 max-w-2xl space-y-6">

        {/* Aviso: como a importação funciona */}
        <div className="bg-fuchsia-50 dark:bg-fuchsia-500/15 border border-fuchsia-100 dark:border-fuchsia-500/20 rounded-xl px-4 py-3 space-y-1.5 text-xs text-fuchsia-700 dark:text-fuchsia-300">
          <p className="font-semibold flex items-center gap-1.5"><Megaphone className="w-3.5 h-3.5" /> Importação automática</p>
          <p className="leading-relaxed">
            As métricas (investimento, impressões e cliques) são importadas de madrugada para
            campanhas com <strong>ID externo</strong> preenchido. Configure o ID da campanha da
            plataforma em{" "}
            <Link href="/marketing/campanhas" className="underline font-medium">Marketing → Campanhas</Link>.
          </p>
        </div>

        {/* Meta Ads */}
        <div className="bg-card rounded-2xl border border-border p-5 space-y-5">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Meta Ads</p>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              Gere um token de usuário de sistema no Business Manager (Configurações do negócio →
              Usuários do sistema) com a permissão <strong>ads_read</strong> na conta de anúncios.
            </p>
          </div>

          <SecretField
            label="Access Token"
            description="Token de usuário de sistema com permissão ads_read"
            value={metaToken}
            onChange={(v) => { setMetaToken(v); mark(); }}
            placeholder="EAAG..."
          />
          <TextField
            label="Ad Account ID"
            description="ID da conta de anúncios, com o prefixo act_"
            value={metaAccount}
            onChange={(v) => { setMetaAccount(v); mark(); }}
            placeholder="act_1234567890"
          />
        </div>

        {/* Google Ads */}
        <div className="bg-card rounded-2xl border border-border p-5 space-y-5">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Google Ads</p>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              Requer um <strong>developer token</strong> aprovado (Centro da API no Google Ads) e
              credenciais OAuth (client ID/secret do Google Cloud) com um <strong>refresh token</strong> do
              escopo <code>adwords</code>.
            </p>
          </div>

          <SecretField
            label="Developer Token"
            description="Token de desenvolvedor aprovado da conta de administrador (MCC)"
            value={gDevToken}
            onChange={(v) => { setGDevToken(v); mark(); }}
          />
          <TextField
            label="OAuth Client ID"
            description="Client ID do app OAuth criado no Google Cloud Console"
            value={gClientId}
            onChange={(v) => { setGClientId(v); mark(); }}
            placeholder="xxxx.apps.googleusercontent.com"
          />
          <SecretField
            label="OAuth Client Secret"
            value={gClientSecret}
            onChange={(v) => { setGClientSecret(v); mark(); }}
          />
          <SecretField
            label="Refresh Token"
            description="Refresh token OAuth obtido com o escopo https://www.googleapis.com/auth/adwords"
            value={gRefreshToken}
            onChange={(v) => { setGRefreshToken(v); mark(); }}
          />
          <TextField
            label="Customer ID"
            description="ID da conta Google Ads, só dígitos, sem hífens"
            value={gCustomerId}
            onChange={(v) => { setGCustomerId(v); mark(); }}
            placeholder="1234567890"
          />
        </div>

        {/* TikTok Ads */}
        <div className="bg-card rounded-2xl border border-border p-5 space-y-5">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">TikTok Ads</p>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              Crie um app no <strong>TikTok for Business</strong> (developers) com o escopo de{" "}
              <strong>Reporting</strong> e autorize a conta de anunciante para obter o access token.
            </p>
          </div>

          <SecretField
            label="Access Token"
            description="Token de acesso do app TikTok for Business com escopo de Reporting"
            value={ttToken}
            onChange={(v) => { setTtToken(v); mark(); }}
          />
          <TextField
            label="Advertiser ID"
            description="ID da conta de anunciante (Ads Manager → conta)"
            value={ttAdvertiser}
            onChange={(v) => { setTtAdvertiser(v); mark(); }}
            placeholder="7001234567890123456"
          />
        </div>

        {/* Save feedback */}
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
