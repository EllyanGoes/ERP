"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { useTabTitle } from "@/lib/tabs-context";
import ConcorrenteForm from "@/components/marketing/ConcorrenteForm";
import ConcorrenteDadosView from "@/components/marketing/ConcorrenteDadosView";
import ConcorrentePrecos, { type PrecoConcorrente } from "@/components/marketing/ConcorrentePrecos";
import ConcorrenteContatos, { type ContatoConcorrente } from "@/components/marketing/ConcorrenteContatos";
import ConcorrenteCanais, { type CanalConcorrente } from "@/components/marketing/ConcorrenteCanais";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2, Trash2, Pencil, Building2, Store, HardHat, User, Handshake } from "lucide-react";

type Concorrente = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  ehFornecedor: boolean;
  ehRevendedor: boolean;
  ehConstrutora: boolean;
  ehConsumidorFinal: boolean;
  ativo: boolean;
  latitude: number | null;
  longitude: number | null;
  geoManual: boolean;
  geoReferencia: string | null;
  precos: PrecoConcorrente[];
  contatos?: ContatoConcorrente[];
  canais?: CanalConcorrente[];
  [k: string]: any;
};

type Aba = "dados" | "contatos" | "canais" | "precos";

export default function ConcorrenteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Concorrente | null>(null);
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState<Aba>("dados");
  const [contatosCount, setContatosCount] = useState<number | null>(null);
  const [canaisCount, setCanaisCount] = useState<number | null>(null);
  const [editando, setEditando] = useState(false);
  useTabTitle(data ? (data.nomeFantasia || data.razaoSocial) : null);

  const carregar = useCallback(async () => {
    const res = await fetch(`/api/marketing/concorrentes/${id}`);
    if (res.ok) setData((await res.json()).data);
    setLoading(false);
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  async function excluir() {
    if (!confirm("Inativar este concorrente? Ele sai das listas e do mapa, mas o histórico de preços é mantido.")) return;
    await fetch(`/api/marketing/concorrentes/${id}`, { method: "DELETE" });
    router.push("/marketing/inteligencia-comercial");
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!data) {
    return <div className="px-8 py-16 text-center text-muted-foreground">Concorrente não encontrado.</div>;
  }

  const TABS: { key: Aba; label: string }[] = [
    { key: "dados", label: "Dados Cadastrais" },
    { key: "contatos", label: `Contatos (${contatosCount ?? data.contatos?.length ?? 0})` },
    { key: "canais", label: `Canais (${canaisCount ?? data.canais?.length ?? 0})` },
    { key: "precos", label: `Preços (${data.precos.length})` },
  ];

  return (
    <div>
      <PageHeader
        title={data.nomeFantasia || data.razaoSocial}
        breadcrumbs={[
          { label: "Marketing" },
          { label: "Inteligência Comercial", href: "/marketing/inteligencia-comercial" },
          { label: data.nomeFantasia || data.razaoSocial },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {data.clienteId && (
              <a
                href={`/clientes/${data.clienteId}`}
                title="Está na nossa base de clientes — atendido por uma empresa do grupo"
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 hover:underline"
              >
                <Handshake className="h-3 w-3" /> Parceiro
              </a>
            )}
            {data.ehFornecedor && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"><Building2 className="h-3 w-3" /> Fornecedor</span>
            )}
            {data.ehRevendedor && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400"><Store className="h-3 w-3" /> Revendedor</span>
            )}
            {data.ehConstrutora && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400"><HardHat className="h-3 w-3" /> Construtora</span>
            )}
            {data.ehConsumidorFinal && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400"><User className="h-3 w-3" /> Consumidor final</span>
            )}
            <span className={cn("text-[11px] font-medium px-2 py-1 rounded-full", data.ativo ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
              {data.ativo ? "Ativo" : "Inativo"}
            </span>
            {aba === "dados" && !editando && (
              <Button variant="outline" onClick={() => setEditando(true)} className="gap-2"><Pencil className="h-4 w-4" /> Editar</Button>
            )}
            <Button variant="outline" onClick={excluir} className="gap-2 text-danger border-danger/30 hover:bg-danger/10">
              <Trash2 className="h-4 w-4" /> Inativar
            </Button>
          </div>
        }
      />

      <div className="px-8 pb-10">
        {/* Tab bar (estilo ClienteDetail) */}
        <div className="border-b border-border mb-6">
          <div className="flex gap-0">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setAba(t.key)}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex items-center gap-1.5",
                  aba === t.key ? "border-blue-600 text-info" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── DADOS CADASTRAIS ──────────────────────────────────────────── */}
        {aba === "dados" && (
          editando ? (
            <ConcorrenteForm
              concorrente={data as any}
              onSaved={() => { setEditando(false); carregar(); }}
              onCancel={() => setEditando(false)}
            />
          ) : (
            <ConcorrenteDadosView c={data as any} />
          )
        )}

        {/* ── CONTATOS ──────────────────────────────────────────────────── */}
        {aba === "contatos" && (
          <ConcorrenteContatos concorrenteId={data.id} contatosIniciais={data.contatos ?? []} onCount={setContatosCount} />
        )}

        {/* ── CANAIS ────────────────────────────────────────────────────── */}
        {aba === "canais" && (
          <ConcorrenteCanais concorrenteId={data.id} canaisIniciais={data.canais ?? []} onCount={setCanaisCount} />
        )}

        {/* ── PREÇOS ────────────────────────────────────────────────────── */}
        {aba === "precos" && <ConcorrentePrecos concorrenteId={data.id} precosIniciais={data.precos} />}
      </div>
    </div>
  );
}
