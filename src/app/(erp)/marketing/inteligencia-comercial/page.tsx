"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import CreateDrawer from "@/components/shared/CreateDrawer";
import ConcorrenteForm from "@/components/marketing/ConcorrenteForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { Plus, Search, MapPin, Map as MapIcon, Building2, Store, Tag, Loader2, ChevronRight, Crosshair, BarChart3, Handshake } from "lucide-react";

type Concorrente = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  ehFornecedor: boolean;
  ehRevendedor: boolean;
  clienteId: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  latitude: number | null;
  longitude: number | null;
  _count: { precos: number };
};

const FILTROS = [
  { value: "", label: "Todos" },
  { value: "fornecedor", label: "Fornecedores" },
  { value: "revendedor", label: "Revendedores" },
  { value: "parceiro", label: "Parceiros" },
];

export default function InteligenciaComercialPage() {
  useTabTitle("Inteligência Comercial");
  const router = useRouter();
  const [lista, setLista] = useState<Concorrente[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState("");
  const [openDrawer, setOpenDrawer] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (categoria) params.set("categoria", categoria);
    const res = await fetch(`/api/marketing/concorrentes?${params.toString()}`);
    const json = await res.json();
    setLista(json.data ?? []);
    setLoading(false);
  }, [q, categoria]);

  useEffect(() => {
    const t = setTimeout(carregar, 250);
    return () => clearTimeout(t);
  }, [carregar]);

  async function localizarTodos() {
    setGeoBusy(true);
    setGeoMsg("Localizando concorrentes pelo endereço...");
    const acc = { localizados: 0, falhas: 0, semEndereco: 0, processados: 0 };
    let cursor: string | null = null;
    try {
      do {
        const res = await fetch("/api/marketing/concorrentes/geocodificar-todos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cursor }),
        });
        if (!res.ok) {
          setGeoMsg("Erro ao geocodificar. Tente novamente.");
          return;
        }
        const j: {
          processados: number;
          localizados: number;
          falhas: number;
          semEndereco: number;
          proximoCursor: string | null;
        } = await res.json();
        acc.localizados += j.localizados;
        acc.falhas += j.falhas;
        acc.semEndereco += j.semEndereco;
        acc.processados += j.processados;
        cursor = j.proximoCursor;
      } while (cursor);

      if (acc.processados === 0) {
        setGeoMsg("Nenhum concorrente pendente de localização.");
      } else {
        setGeoMsg(
          `${acc.localizados} localizado(s)` +
            (acc.falhas ? `, ${acc.falhas} sem correspondência` : "") +
            (acc.semEndereco ? `, ${acc.semEndereco} sem endereço` : "") +
            ".",
        );
      }
      carregar();
    } catch {
      setGeoMsg("Erro de conexão durante a geocodificação.");
    } finally {
      setGeoBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Inteligência Comercial"
        subtitle="Concorrentes de mercado, categoria, endereço e mapeamento de preços"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={localizarTodos} disabled={geoBusy} className="gap-2">
              {geoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />} Localizar todos
            </Button>
            <Link href="/marketing/inteligencia-comercial/relatorio-precos">
              <Button variant="outline" className="gap-2"><BarChart3 className="h-4 w-4" /> Preço de Mercado</Button>
            </Link>
            <Link href="/marketing/inteligencia-comercial/mapa">
              <Button variant="outline" className="gap-2"><MapIcon className="h-4 w-4" /> Mapa (geomarketing)</Button>
            </Link>
            <Button onClick={() => setOpenDrawer(true)} className="gap-2"><Plus className="h-4 w-4" /> Novo Concorrente</Button>
          </div>
        }
      />

      <div className="px-8 pb-8">
        {geoMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm text-muted-foreground">
            {geoBusy && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
            {geoMsg}
          </div>
        )}
        {/* Filtros */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou cidade..." className="pl-9 h-10 border-border" />
          </div>
          <div className="flex gap-1 rounded-lg border border-border p-1">
            {FILTROS.map((f) => (
              <button
                key={f.value}
                onClick={() => setCategoria(f.value)}
                className={cn("px-3 py-1.5 text-sm rounded-md transition-colors", categoria === f.value ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-muted")}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : lista.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><Tag className="h-6 w-6 text-muted-foreground" /></div>
              <p className="text-sm font-medium text-foreground">Nenhum concorrente cadastrado</p>
              <p className="text-sm text-muted-foreground">Comece cadastrando um concorrente de mercado.</p>
              <Button onClick={() => setOpenDrawer(true)} className="mt-2 gap-2"><Plus className="h-4 w-4" /> Novo Concorrente</Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="px-5 py-2.5 font-semibold">Concorrente</th>
                  <th className="px-3 py-2.5 font-semibold">Categoria</th>
                  <th className="px-3 py-2.5 font-semibold">Bairro</th>
                  <th className="px-3 py-2.5 font-semibold">Localização</th>
                  <th className="px-3 py-2.5 font-semibold text-center">Preços</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/marketing/inteligencia-comercial/${c.id}`)}
                    className="border-b border-border last:border-0 hover:bg-muted/40 cursor-pointer"
                  >
                    <td className="px-5 py-3">
                      <p className="font-medium text-foreground">{c.nomeFantasia || c.razaoSocial}</p>
                      {c.nomeFantasia && <p className="text-xs text-muted-foreground">{c.razaoSocial}</p>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {c.ehFornecedor && <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"><Building2 className="h-3 w-3" /> Fornecedor</span>}
                        {c.ehRevendedor && <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400"><Store className="h-3 w-3" /> Revendedor</span>}
                        {c.clienteId && <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" title="Está na nossa base de clientes — atendido pelo grupo"><Handshake className="h-3 w-3" /> Parceiro</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{c.bairro || "—"}</td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {c.cidade ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className={cn("h-3.5 w-3.5", c.latitude != null ? "text-emerald-500" : "text-muted-foreground/50")} />
                          {c.cidade}{c.estado ? `/${c.estado}` : ""}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-3 text-center text-muted-foreground">{c._count.precos}</td>
                    <td className="px-3 py-3 text-right"><ChevronRight className="h-4 w-4 text-muted-foreground/60 inline" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <CreateDrawer open={openDrawer} onOpenChange={setOpenDrawer} title="Cadastrar Concorrente" width="xl" onCreated={carregar}>
        <ConcorrenteForm />
      </CreateDrawer>
    </div>
  );
}
