"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Loader2, Save, Eye, EyeOff, CheckCircle2, AlertCircle, CreditCard } from "lucide-react";

const SECRET_MASK = "••••••••";

type ConfigEmpresa = {
  empresaId: string;
  empresaNome: string;
  provedor: string;
  ambiente: string;
  pontoVendaId: string;
  ativo: boolean;
  accessToken: string;
  temToken: boolean;
};

export default function IntegracaoPagamentoPage() {
  const [configs, setConfigs] = useState<ConfigEmpresa[]>([]);
  const [empresaSel, setEmpresaSel] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch("/api/configuracoes/integracoes/pagamento").then((r) => r.json());
      const lista: ConfigEmpresa[] = j.data ?? [];
      setConfigs(lista);
      setEmpresaSel((sel) => sel || (lista[0]?.empresaId ?? ""));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const config = configs.find((c) => c.empresaId === empresaSel) ?? null;

  function atualizarCampo(campo: keyof ConfigEmpresa, valor: unknown) {
    setConfigs((prev) => prev.map((c) => c.empresaId === empresaSel ? { ...c, [campo]: valor } : c));
    setMsg(null);
  }

  async function salvar() {
    if (!config) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/configuracoes/integracoes/pagamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresaId: config.empresaId,
          provedor: config.provedor,
          ambiente: config.ambiente,
          pontoVendaId: config.pontoVendaId,
          ativo: config.ativo,
          accessToken: config.accessToken, // máscara = não muda
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ tipo: "erro", texto: j.error ?? "Erro ao salvar" }); return; }
      // reflete o token salvo como máscara
      setConfigs((prev) => prev.map((c) => c.empresaId === empresaSel
        ? { ...c, accessToken: j.data.temToken ? SECRET_MASK : "", temToken: j.data.temToken }
        : c));
      setShowToken(false);
      setMsg({ tipo: "ok", texto: "Configuração salva." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Maquininha / Pagamento"
        breadcrumbs={[{ label: "Configurações" }, { label: "Integrações", href: "/configuracoes/integracoes" }, { label: "Maquininha" }]}
        subtitle="Credenciais da adquirente por empresa para cobrança automática no Caixa"
      />

      <div className="px-8 pb-8 max-w-2xl space-y-5">
        {loading ? (
          <div className="text-gray-400 flex items-center gap-2 text-sm pt-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
          </div>
        ) : configs.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma empresa ativa.</p>
        ) : (
          <>
            {/* Aviso sobre cobrança automática */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 leading-relaxed">
              <strong>Como funciona:</strong> guarde aqui as credenciais da maquininha de cada empresa.
              A cobrança automática (enviar o valor para a maquininha e receber a confirmação) só é
              possível com adquirentes que oferecem API de nuvem — atualmente <strong>Stone</strong>.
              Sicredi e Caixa continuam pela operação manual do Caixa. Enquanto a cobrança automática
              não estiver ligada, o Caixa segue confirmando o pagamento manualmente.
            </div>

            {/* Seletor de empresa */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Empresa</Label>
              <ComboboxWithCreate
                value={empresaSel}
                onChange={(v) => { setEmpresaSel(v); setShowToken(false); setMsg(null); }}
                allowNone={false}
                triggerClassName="h-10 rounded-lg"
                options={configs.map((c) => ({ value: c.empresaId, label: `${c.empresaNome}${c.ativo ? " — ativo" : ""}` }))}
              />
            </div>

            {config && (
              <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
                <div className="flex items-center gap-3 pb-1">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">Adquirente</p>
                    <p className="text-xs text-gray-400">Configuração de {config.empresaNome}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">Provedor</Label>
                    <select
                      value={config.provedor}
                      onChange={(e) => atualizarCampo("provedor", e.target.value)}
                      className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="STONE">Stone</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">Ambiente</Label>
                    <select
                      value={config.ambiente}
                      onChange={(e) => atualizarCampo("ambiente", e.target.value)}
                      className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="PRODUCAO">Produção</option>
                      <option value="SANDBOX">Sandbox (teste)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Ponto de venda / Serial do terminal</Label>
                  <Input
                    value={config.pontoVendaId}
                    onChange={(e) => atualizarCampo("pontoVendaId", e.target.value)}
                    placeholder="ID do ponto de venda ou número de série da maquininha"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Token de acesso (credencial da adquirente)</Label>
                  <div className="relative">
                    <Input
                      type={showToken ? "text" : "password"}
                      value={config.accessToken}
                      onChange={(e) => atualizarCampo("accessToken", e.target.value)}
                      onFocus={() => { if (config.accessToken === SECRET_MASK) { atualizarCampo("accessToken", ""); setShowToken(true); } }}
                      placeholder={config.temToken ? "Token salvo — deixe em branco para manter" : "Cole o token de integração"}
                      className="pr-10 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Credencial secreta — fica só no servidor e nunca é exibida depois de salva.
                  </p>
                </div>

                <label className="flex items-center gap-2.5 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.ativo}
                    onChange={(e) => atualizarCampo("ativo", e.target.checked)}
                    className="w-4 h-4 accent-emerald-600"
                  />
                  <span className="text-sm text-gray-700">
                    Ligar cobrança automática no Caixa
                    <span className="block text-[11px] text-gray-400">Quando ativo, o Caixa envia a cobrança direto para a maquininha desta empresa (requer provedor com API).</span>
                  </span>
                </label>

                {msg && (
                  <div className={cn(
                    "flex items-center gap-2 text-sm rounded-lg px-3 py-2",
                    msg.tipo === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
                  )}>
                    {msg.tipo === "ok" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {msg.texto}
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <Button onClick={salvar} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                    Salvar
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
