"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Loader2, Save, Eye, EyeOff, CheckCircle2, AlertCircle,
  Wifi, WifiOff, HelpCircle,
} from "lucide-react";

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

export default function DbEngemanIntegracaoPage() {
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [dirty,    setDirty]    = useState(false);
  const [saveMsg,  setSaveMsg]  = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [status,   setStatus]   = useState<ConnStatus>("unconfigured");

  const [host,     setHost]     = useState("");
  const [name,     setName]     = useState("");
  const [user,     setUser]     = useState("");
  const [password, setPassword] = useState("");

  function mark() { setDirty(true); setSaveMsg(null); }

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await fetch("/api/configuracoes/integracoes").then((r) => r.json());
      setHost(cfg.db_engeman_host ?? "");
      setName(cfg.db_engeman_name ?? "");
      setUser(cfg.db_engeman_user ?? "");
      setPassword(cfg.db_engeman_password ?? "");
      setStatus(!!(cfg.db_engeman_host && cfg.db_engeman_name && cfg.db_engeman_user) ? "ok" : "unconfigured");
    } catch {
      setStatus("unconfigured");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  async function handleSave() {
    setSaving(true); setSaveMsg(null);
    try {
      const res = await fetch("/api/configuracoes/integracoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          db_engeman_host:     host.trim()     || null,
          db_engeman_name:     name.trim()     || null,
          db_engeman_user:     user.trim()     || null,
          db_engeman_password: password.trim() || null,
        }),
      });
      if (!res.ok) { setSaveMsg({ type: "err", text: (await res.json()).error || "Erro ao salvar" }); return; }
      setSaveMsg({ type: "ok", text: "Credenciais salvas com sucesso!" });
      setDirty(false);
      setStatus(!!(host && name && user) ? "ok" : "unconfigured");
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
        title="DB Engeman Slave"
        breadcrumbs={[
          { label: "Configurações" },
          { label: "Integrações", href: "/configuracoes/integracoes" },
          { label: "DB Engeman" },
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

        <div className="bg-info/10 border border-info/20 rounded-xl px-4 py-3 text-xs text-info">
          <p className="font-semibold mb-1">Acesso somente leitura</p>
          <p className="text-info leading-relaxed">
            Esta integração conecta ao banco de dados SQL Server do Engeman (módulo de manutenção)
            em modo leitura. Nenhuma escrita é realizada pelo ERP.
          </p>
        </div>

        <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Conexão</p>
          <div className="grid grid-cols-2 gap-3">
            <PlainField label="Host / IP"
              description="Endereço do servidor SQL Server"
              value={host} onChange={(v) => { setHost(v); mark(); }} placeholder="192.168.0.206" />
            <PlainField label="Banco de Dados"
              value={name} onChange={(v) => { setName(v); mark(); }} placeholder="ENGEMAN_SLAVE" />
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Autenticação</p>
          <div className="grid grid-cols-2 gap-3">
            <PlainField label="Usuário"
              value={user} onChange={(v) => { setUser(v); mark(); }} placeholder="sa" />
            <SecretField label="Senha"
              value={password} onChange={(v) => { setPassword(v); mark(); }} placeholder="••••••••" />
          </div>
        </div>

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
