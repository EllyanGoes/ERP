"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import { Smartphone, Monitor, Loader2, LogOut, ShieldCheck, Check } from "lucide-react";

type Sessao = {
  id: string;
  dispositivo: string | null;
  navegador: string | null;
  so: string | null;
  ip: string | null;
  criadoEm: string;
  ultimoAcessoEm: string;
  atual: boolean;
};

function tempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d > 1 ? "s" : ""}`;
}

export default function DispositivosPage() {
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch("/api/auth/sessions").then((r) => r.json());
      setSessoes(j.data ?? []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function revogar(s: Sessao) {
    if (s.atual && !confirm("Sair deste dispositivo (encerra a sessão atual)?")) return;
    setBusy(s.id);
    try {
      const j = await fetch(`/api/auth/sessions/${s.id}`, { method: "DELETE" }).then((r) => r.json());
      if (j.data?.atual) { window.location.href = "/login"; return; }
      setSessoes((prev) => prev.filter((x) => x.id !== s.id));
    } finally { setBusy(null); }
  }

  async function revogarOutros() {
    if (!confirm("Sair de todos os outros dispositivos?")) return;
    setBusy("others");
    try {
      await fetch("/api/auth/sessions/revoke-others", { method: "POST" });
      await load();
    } finally { setBusy(null); }
  }

  const outros = sessoes.filter((s) => !s.atual).length;

  return (
    <div>
      <PageHeader
        title="Dispositivos conectados"
        breadcrumbs={[{ label: "Minha conta" }, { label: "Dispositivos" }]}
        action={outros > 0 ? (
          <Button variant="outline" size="sm" onClick={revogarOutros} disabled={busy === "others"} className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50">
            {busy === "others" ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            Sair dos demais ({outros})
          </Button>
        ) : undefined}
      />
      <div className="px-8 pb-8 max-w-2xl space-y-4">
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
          <p>Estes são os dispositivos com sua conta logada. Encerre os que você não reconhece ou não usa mais — a revogação vale em até ~1 minuto.</p>
        </div>

        {loading ? (
          <div className="py-16 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-300" /></div>
        ) : sessoes.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">Nenhuma sessão ativa.</div>
        ) : (
          <div className="space-y-3">
            {sessoes.map((s) => {
              const Icon = s.dispositivo === "Celular/Tablet" ? Smartphone : Monitor;
              return (
                <div key={s.id} className={`flex items-center gap-3 rounded-xl border p-4 ${s.atual ? "border-emerald-200 bg-emerald-50/40" : "border-gray-200 bg-white"}`}>
                  <span className={`flex w-10 h-10 items-center justify-center rounded-lg ${s.atual ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                    <Icon className="w-5 h-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 flex items-center gap-2">
                      {s.navegador ?? "Navegador"} · {s.so ?? "SO"}
                      {s.atual && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5"><Check className="w-3 h-3" /> Este dispositivo</span>}
                    </p>
                    <p className="text-xs text-gray-400">
                      {s.ip ?? "IP desconhecido"} · último acesso {tempoRelativo(s.ultimoAcessoEm)} · desde {formatDateTime(s.criadoEm)}
                    </p>
                  </div>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => revogar(s)}
                    disabled={busy === s.id}
                    className={`gap-1.5 shrink-0 ${s.atual ? "" : "border-red-200 text-red-600 hover:bg-red-50"}`}
                  >
                    {busy === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                    {s.atual ? "Sair" : "Encerrar"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
