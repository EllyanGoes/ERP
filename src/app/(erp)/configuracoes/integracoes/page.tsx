"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";
import {
  Loader2, MessageCircle, Send, Database, ChevronRight,
  Wifi, WifiOff, HelpCircle, CreditCard,
} from "lucide-react";

type ConnStatus = "idle" | "ok" | "error" | "unconfigured";

function StatusPill({ status }: { status: ConnStatus }) {
  if (status === "idle") return null;
  if (status === "ok") return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">
      <Wifi className="w-2.5 h-2.5" /> Conectado
    </span>
  );
  if (status === "error") return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">
      <WifiOff className="w-2.5 h-2.5" /> Erro
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-400">
      <HelpCircle className="w-2.5 h-2.5" /> Não configurado
    </span>
  );
}

export default function IntegracoesPage() {
  const [loading,    setLoading]    = useState(true);
  const [waStatus,   setWaStatus]   = useState<ConnStatus>("idle");
  const [tgStatus,   setTgStatus]   = useState<ConnStatus>("idle");
  const [dbStatus,   setDbStatus]   = useState<ConnStatus>("idle");
  const [waProvider, setWaProvider] = useState("Evolution API");
  const [payStatus,  setPayStatus]  = useState<ConnStatus>("idle");

  const loadStatuses = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await fetch("/api/configuracoes/integracoes").then((r) => r.json());

      // WA status
      const prov = cfg.wa_provider ?? "evolution";
      const provLabels: Record<string, string> = {
        evolution: "Evolution API",
        meta:      "Meta Cloud API",
        zapi:      "Z-API",
      };
      setWaProvider(provLabels[prov] ?? prov);
      const hasWa =
        prov === "evolution" ? !!(cfg.wa_evolution_url && cfg.wa_evolution_instance && cfg.wa_evolution_apikey) :
        prov === "meta"      ? !!(cfg.wa_meta_phone_id && cfg.wa_meta_access_token) :
                               !!(cfg.wa_zapi_instance_id && cfg.wa_zapi_token);
      setWaStatus(hasWa ? "ok" : "unconfigured");

      // Telegram
      setTgStatus(!!(cfg.tg_bot_token && cfg.tg_chat_id) ? "ok" : "unconfigured");

      // DB Engeman
      setDbStatus(!!(cfg.db_engeman_host && cfg.db_engeman_name && cfg.db_engeman_user) ? "ok" : "unconfigured");

      // Pagamento (maquininha): "ok" se alguma empresa tem a cobrança ativa
      try {
        const pay = await fetch("/api/configuracoes/integracoes/pagamento").then((r) => r.json());
        const algumaAtiva = Array.isArray(pay.data) && pay.data.some((c: { ativo: boolean }) => c.ativo);
        setPayStatus(algumaAtiva ? "ok" : "unconfigured");
      } catch { setPayStatus("unconfigured"); }
    } catch {
      setWaStatus("unconfigured");
      setTgStatus("unconfigured");
      setDbStatus("unconfigured");
      setPayStatus("unconfigured");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatuses(); }, [loadStatuses]);

  if (loading) return (
    <div className="px-8 pt-8 text-gray-400 flex items-center gap-2 text-sm">
      <Loader2 className="w-4 h-4 animate-spin" /> Carregando integrações...
    </div>
  );

  const integrations = [
    {
      href:    "/configuracoes/integracoes/whatsapp",
      icon:    <MessageCircle className="w-5 h-5 text-emerald-600" />,
      bg:      "bg-emerald-50 border-emerald-100",
      title:   "WhatsApp Business",
      desc:    "Mensagens e aprovações de Solicitações de Compra via WhatsApp",
      badge:   waProvider,
      badgeCn: "bg-emerald-50 text-emerald-700 border-emerald-200",
      status:  waStatus,
    },
    {
      href:    "/configuracoes/integracoes/telegram",
      icon:    <Send className="w-5 h-5 text-sky-500" />,
      bg:      "bg-sky-50 border-sky-100",
      title:   "Telegram",
      desc:    "Notificações e aprovações via bot do Telegram",
      badge:   "Bot API",
      badgeCn: "bg-sky-50 text-sky-600 border-sky-100",
      status:  tgStatus,
    },
    {
      href:    "/configuracoes/integracoes/db-engeman",
      icon:    <Database className="w-5 h-5 text-blue-600" />,
      bg:      "bg-blue-50 border-blue-100",
      title:   "DB Engeman Slave",
      desc:    "Acesso somente leitura ao banco de dados do Engeman (manutenção)",
      badge:   "SQL Server",
      badgeCn: "bg-blue-50 text-blue-600 border-blue-100",
      status:  dbStatus,
    },
    {
      href:    "/configuracoes/integracoes/pagamento",
      icon:    <CreditCard className="w-5 h-5 text-emerald-600" />,
      bg:      "bg-emerald-50 border-emerald-100",
      title:   "Maquininha / Pagamento",
      desc:    "Credenciais da adquirente por empresa para cobrança no Caixa",
      badge:   "Por empresa",
      badgeCn: "bg-emerald-50 text-emerald-700 border-emerald-200",
      status:  payStatus,
    },
  ];

  const comingSoon = [
    { icon: "🔄", name: "ERP Externo / SAP",  desc: "Sincronização de pedidos e estoque" },
    { icon: "🚚", name: "Transportadoras",     desc: "Rastreamento e cotação de frete" },
    { icon: "📄", name: "NF-e / SEFAZ",        desc: "Emissão e consulta de notas fiscais" },
  ];

  return (
    <div>
      <PageHeader
        title="Integrações"
        breadcrumbs={[{ label: "Configurações" }, { label: "Integrações" }]}
        subtitle="Conecte o ERP a serviços externos de mensagens, banco de dados e mais"
      />

      <div className="px-8 pb-8 max-w-3xl space-y-3">

        {/* Active integrations */}
        {integrations.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group block bg-white rounded-2xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-150"
          >
            <div className="flex items-center gap-4 px-5 py-4">
              <div className={cn("w-10 h-10 rounded-xl border flex items-center justify-center shrink-0", item.bg)}>
                {item.icon}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-gray-900 text-sm">{item.title}</p>
                  <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border", item.badgeCn)}>
                    {item.badge}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <StatusPill status={item.status} />
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
              </div>
            </div>
          </Link>
        ))}

        {/* Divider */}
        <div className="pt-2 pb-1">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Em breve</p>
        </div>

        {/* Coming soon */}
        {comingSoon.map((item) => (
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
