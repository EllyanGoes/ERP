"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Loader2, Save, Eye, EyeOff, CheckCircle2, AlertCircle,
  Send, Wifi, WifiOff, HelpCircle, Pencil, Check, X,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ConnStatus = "idle" | "checking" | "ok" | "error" | "unconfigured";

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusPill({ status, msg }: { status: ConnStatus; msg?: string }) {
  if (status === "checking") return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
      <Loader2 className="w-3 h-3 animate-spin" /> Verificando...
    </span>
  );
  if (status === "ok") return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700" title={msg}>
      <Wifi className="w-3 h-3" /> Conectado
    </span>
  );
  if (status === "error") return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700" title={msg}>
      <WifiOff className="w-3 h-3" /> Erro
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
  label, description, value, onChange, placeholder,
}: {
  label: string; description?: string; value: string;
  onChange: (v: string) => void; placeholder?: string;
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
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-10 h-9 text-sm font-mono"
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

// Chat ID row: editable label + test button + value input
function ChatRow({
  label, onLabelChange,
  value, onValueChange,
  placeholder, description,
  onTest, testing, configKey,
}: {
  label: string; onLabelChange: (v: string) => void;
  value: string; onValueChange: (v: string) => void;
  placeholder?: string; description?: string;
  onTest: (chatId: string, key: string) => void;
  testing: string | null;
  configKey: string;
}) {
  const [editingLabel, setEditingLabel] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(label); }, [label]);

  function commitLabel() {
    const v = draft.trim() || label;
    setDraft(v);
    onLabelChange(v);
    setEditingLabel(false);
  }

  return (
    <div className="space-y-1.5">
      {/* Label row */}
      <div className="flex items-center gap-2">
        {editingLabel ? (
          <>
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitLabel();
                if (e.key === "Escape") { setDraft(label); setEditingLabel(false); }
              }}
              onBlur={commitLabel}
              autoFocus
              className="text-xs font-medium text-gray-700 border-b border-blue-400 outline-none bg-transparent w-40"
            />
            <button type="button" onClick={commitLabel} className="text-emerald-500 hover:text-emerald-600">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => { setDraft(label); setEditingLabel(false); }} className="text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <>
            <span className="text-xs font-medium text-gray-600">{label}</span>
            <button
              type="button"
              onClick={() => { setDraft(label); setEditingLabel(true); }}
              className="text-gray-300 hover:text-gray-500 transition-colors"
              title="Renomear"
            >
              <Pencil className="w-3 h-3" />
            </button>
          </>
        )}

        <div className="flex-1" />

        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-[11px] gap-1"
          onClick={() => onTest(value, configKey)}
          disabled={!value || testing === configKey}
        >
          {testing === configKey
            ? <><Loader2 className="w-3 h-3 animate-spin" />Enviando...</>
            : <><Send className="w-3 h-3" />Testar e Enviar</>}
        </Button>
      </div>

      {description && <p className="text-[11px] text-gray-400 leading-tight">{description}</p>}
      <Input
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 text-sm font-mono"
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TelegramIntegracaoPage() {
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [dirty,    setDirty]    = useState(false);
  const [saveMsg,  setSaveMsg]  = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [tgBotToken,        setTgBotToken]        = useState("");
  const [tgChatId,          setTgChatId]          = useState("");
  const [tgChatIdLabel,     setTgChatIdLabel]     = useState("Canal Suprimentos");
  const [tgChatEstoque,     setTgChatEstoque]     = useState("");
  const [tgChatEstoqueLabel, setTgChatEstoqueLabel] = useState("Canal Estoque");

  const [status,    setStatus]    = useState<ConnStatus>("idle");
  const [statusMsg, setStatusMsg] = useState("");

  // per-chat test tracking: null = none, string = configKey being tested
  const [testingChat, setTestingChat] = useState<string | null>(null);
  const [testMsg,     setTestMsg]     = useState<{ key: string; type: "ok" | "err"; text: string } | null>(null);

  // Webhook
  const [webhookUrl,     setWebhookUrl]     = useState<string | null>(null);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookMsg,     setWebhookMsg]     = useState<{ type: "ok" | "err"; text: string } | null>(null);

  function mark() { setDirty(true); setSaveMsg(null); }

  // ── Load ───────────────────────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await fetch("/api/configuracoes/integracoes").then((r) => r.json());
      setTgBotToken(cfg.tg_bot_token ?? "");
      setTgChatId(cfg.tg_chat_id ?? "");
      setTgChatIdLabel(cfg.tg_chat_id_label || "Canal Suprimentos");
      setTgChatEstoque(cfg.tg_chat_estoque ?? "");
      setTgChatEstoqueLabel(cfg.tg_chat_estoque_label || "Canal Estoque");
      setStatus(!!(cfg.tg_bot_token && cfg.tg_chat_id) ? "ok" : "unconfigured");

      // Load webhook info
      const wh = await fetch("/api/configuracoes/integracoes/telegram-webhook").then((r) => r.json());
      if (wh.ok) setWebhookUrl(wh.url ?? null);
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
          tg_bot_token:           tgBotToken.trim()          || null,
          tg_chat_id:             tgChatId.trim()            || null,
          tg_chat_id_label:       tgChatIdLabel.trim()       || null,
          tg_chat_estoque:        tgChatEstoque.trim()       || null,
          tg_chat_estoque_label:  tgChatEstoqueLabel.trim()  || null,
        }),
      });
      if (!res.ok) {
        setSaveMsg({ type: "err", text: (await res.json()).error || "Erro ao salvar" });
        return;
      }
      setSaveMsg({ type: "ok", text: "Configurações salvas com sucesso!" });
      setDirty(false);
      setStatus(!!(tgBotToken && tgChatId) ? "ok" : "unconfigured");
    } catch {
      setSaveMsg({ type: "err", text: "Erro de conexão." });
    } finally {
      setSaving(false);
    }
  }

  // ── Test per chat ──────────────────────────────────────────────────────────
  async function handleTestChat(chatId: string, configKey: string) {
    if (!chatId || !tgBotToken) return;
    setTestingChat(configKey);
    setTestMsg(null);
    try {
      const res = await fetch("/api/configuracoes/integracoes/telegram-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId }),
      });
      const d = await res.json() as { connected: boolean; reason?: string };
      setStatus(d.connected ? "ok" : "error");
      setStatusMsg(d.reason ?? "");
      setTestMsg({
        key: configKey,
        type: d.connected ? "ok" : "err",
        text: d.connected ? "Mensagem de teste enviada com sucesso!" : (d.reason ?? "Falha ao enviar mensagem"),
      });
    } catch {
      setTestMsg({ key: configKey, type: "err", text: "Erro de conexão ao testar." });
    } finally {
      setTestingChat(null);
    }
  }

  // ── Webhook ────────────────────────────────────────────────────────────────
  async function handleRegisterWebhook() {
    setWebhookLoading(true); setWebhookMsg(null);
    try {
      const res = await fetch("/api/configuracoes/integracoes/telegram-webhook", { method: "POST" });
      const d   = await res.json() as { ok?: boolean; webhookUrl?: string; error?: string };
      if (!res.ok || !d.ok) {
        setWebhookMsg({ type: "err", text: d.error ?? "Erro ao registrar webhook" });
      } else {
        setWebhookUrl(d.webhookUrl ?? null);
        setWebhookMsg({ type: "ok", text: "Webhook registrado com sucesso!" });
      }
    } catch {
      setWebhookMsg({ type: "err", text: "Erro de conexão." });
    } finally {
      setWebhookLoading(false);
    }
  }

  if (loading) return (
    <div className="px-8 pt-8 text-gray-400 flex items-center gap-2 text-sm">
      <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Telegram"
        breadcrumbs={[
          { label: "Configurações" },
          { label: "Integrações", href: "/configuracoes/integracoes" },
          { label: "Telegram" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <StatusPill status={status} msg={statusMsg} />
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !dirty}
            >
              {saving
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Salvando...</>
                : <><Save className="w-3.5 h-3.5 mr-1.5" />Salvar</>}
            </Button>
          </div>
        }
      />

      <div className="px-8 pb-8 max-w-2xl space-y-6">

        {/* How to */}
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

        {/* Credentials */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Credenciais</p>

          <SecretField
            label="Bot Token"
            description="Token gerado pelo @BotFather (ex: 123456789:AAFxxx...)"
            value={tgBotToken}
            onChange={(v) => { setTgBotToken(v); mark(); }}
            placeholder="123456789:AAF..."
          />
        </div>

        {/* Canais */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Canais</p>

          <ChatRow
            label={tgChatIdLabel}
            onLabelChange={(v) => { setTgChatIdLabel(v); mark(); }}
            value={tgChatId}
            onValueChange={(v) => { setTgChatId(v); mark(); }}
            placeholder="-1001234567890"
            description="Canal principal de notificações (SC, aprovações)"
            onTest={handleTestChat}
            testing={testingChat}
            configKey="tg_chat_id"
          />

          {testMsg?.key === "tg_chat_id" && (
            <div className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-xs border",
              testMsg.type === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"
            )}>
              {testMsg.type === "ok" ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
              <span>{testMsg.text}</span>
            </div>
          )}

          <div className="border-t border-gray-100 pt-4">
            <ChatRow
              label={tgChatEstoqueLabel}
              onLabelChange={(v) => { setTgChatEstoqueLabel(v); mark(); }}
              value={tgChatEstoque}
              onValueChange={(v) => { setTgChatEstoque(v); mark(); }}
              placeholder="-1003907639883"
              description="Canal que receberá notificações de movimentações de estoque e alertas de mínimo"
              onTest={handleTestChat}
              testing={testingChat}
              configKey="tg_chat_estoque"
            />

            {testMsg?.key === "tg_chat_estoque" && (
              <div className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-xs border mt-3",
                testMsg.type === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"
              )}>
                {testMsg.type === "ok" ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                <span>{testMsg.text}</span>
              </div>
            )}
          </div>
        </div>

        {/* Save feedback */}
        {saveMsg && (
          <div className={cn(
            "flex items-center gap-2 px-4 py-3 rounded-xl text-sm border",
            saveMsg.type === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"
          )}>
            {saveMsg.type === "ok" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{saveMsg.text}</span>
          </div>
        )}

        {dirty && !saveMsg && (
          <p className="text-xs text-amber-600 font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
            Alterações não salvas — clique em Salvar para confirmar
          </p>
        )}

        {/* Webhook */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Webhook para Aprovações</p>
            <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
              Registre o webhook para que o bot receba as respostas dos botões ✅/❌ enviados ao aprovador via DM.
            </p>
          </div>

          {webhookUrl && (
            <div className="bg-sky-50 border border-sky-100 rounded-xl px-4 py-3 space-y-1">
              <p className="text-[11px] font-semibold text-sky-700">Webhook registrado:</p>
              <p className="text-xs text-sky-700 font-mono break-all select-all">{webhookUrl}</p>
            </div>
          )}

          {webhookMsg && (
            <div className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-xs border",
              webhookMsg.type === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"
            )}>
              {webhookMsg.type === "ok" ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
              <span>{webhookMsg.text}</span>
            </div>
          )}

          <Button
            variant="outline" size="sm"
            onClick={handleRegisterWebhook}
            disabled={webhookLoading || !tgBotToken}
          >
            {webhookLoading
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Registrando...</>
              : <><Wifi className="w-3.5 h-3.5 mr-1.5" />Registrar Webhook</>}
          </Button>
        </div>

      </div>
    </div>
  );
}
