"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import { Building2, Store, HardHat, User, Star, Loader2, type LucideIcon } from "lucide-react";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import "leaflet/dist/leaflet.css";

type Ponto = {
  id: string;          // id do concorrente (link)
  localId: string;     // chave única do ponto (matriz ou local adicional)
  localNome?: string | null;
  razaoSocial: string;
  nomeFantasia: string | null;
  ehFornecedor: boolean;
  ehRevendedor: boolean;
  ehConstrutora: boolean;
  ehConsumidorFinal: boolean;
  clienteId: string | null;
  ehParceiro: boolean;
  cidade: string | null;
  estado: string | null;
  latitude: number;
  longitude: number;
  _count: { precos: number };
};

// Parceria comercial ativa (flag própria — dá pra tornar/desfazer pelo balão).
function ehParceiro(p: Ponto): boolean {
  return p.ehParceiro;
}

type Categoria = "construtora" | "consumidor" | "fornecedor" | "revendedor" | "ambos";

// Cor por categoria: construtora=laranja, consumidor=fúcsia, fornecedor=âmbar,
// ambos=violeta, revendedor=azul. Parceiro NÃO muda a cor — vira uma estrela
// dentro do círculo (fazemos atividade comercial com ele), em qualquer categoria.
const COR: Record<Categoria, string> = {
  construtora: "#f97316", consumidor: "#d946ef", fornecedor: "#f59e0b", revendedor: "#3b82f6", ambos: "#8b5cf6",
};
function categoriaDe(p: Ponto): Categoria {
  if (p.ehConstrutora) return "construtora";
  if (p.ehConsumidorFinal) return "consumidor";
  if (p.ehFornecedor && p.ehRevendedor) return "ambos";
  if (p.ehFornecedor) return "fornecedor";
  return "revendedor";
}
function corDe(p: Ponto): string { return COR[categoriaDe(p)]; }

// Pino em SVG (divIcon): círculo na cor da categoria + estrela branca quando parceiro.
// divIcon com SVG inline não sofre do problema dos ícones default do Leaflet.
const ESTRELA_PATH = "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z";
const iconeCache: Record<string, L.DivIcon> = {};
function iconeDe(p: Ponto): L.DivIcon {
  const cor = corDe(p);
  const parceiro = ehParceiro(p);
  const chave = `${cor}|${parceiro}`;
  if (!iconeCache[chave]) {
    const estrela = parceiro
      ? `<path d="${ESTRELA_PATH}" fill="#fff" transform="translate(12 12) scale(0.62) translate(-12 -12)"/>`
      : "";
    iconeCache[chave] = L.divIcon({
      className: "", // sem o quadrado branco default do divIcon
      html: `<svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="${cor}" fill-opacity="0.75" stroke="${cor}" stroke-width="2"/>${estrela}</svg>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
  }
  return iconeCache[chave];
}

// Linhas da legenda/filtro de visibilidade. "parceiro" é transversal às
// categorias: desligado, esconde os pinos com estrela (de qualquer categoria).
type ChaveVisibilidade = Categoria | "parceiro";
const LEGENDA: { cat: ChaveVisibilidade; label: string; Icon?: LucideIcon }[] = [
  { cat: "fornecedor", label: "Fornecedor", Icon: Building2 },
  { cat: "revendedor", label: "Revendedor", Icon: Store },
  { cat: "ambos", label: "Ambos" },
  { cat: "construtora", label: "Construtora", Icon: HardHat },
  { cat: "consumidor", label: "Consumidor final", Icon: User },
  { cat: "parceiro", label: "Parceiro (estrela)", Icon: Star },
];
const TODAS_VISIVEIS: Record<ChaveVisibilidade, boolean> = {
  construtora: true, consumidor: true, fornecedor: true, revendedor: true, ambos: true, parceiro: true,
};

const CENTRO_BRASIL: [number, number] = [-15.78, -47.93];

// Enquadra o mapa nos marcadores (aproxima ao máximo, com folga) sempre que os
// pontos mudam — evita o mapa "afastado" com os pontos amontoados num canto.
function FitBounds({ pontos }: { pontos: Ponto[] }) {
  const map = useMap();
  useEffect(() => {
    if (!pontos.length) return;
    const coords = pontos.map((p) => [p.latitude, p.longitude] as [number, number]);
    map.fitBounds(coords, { padding: [50, 50], maxZoom: 15, animate: false });
  }, [pontos, map]);
  return null;
}

export default function ConcorrentesMap() {
  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvandoParceria, setSalvandoParceria] = useState<string | null>(null);

  // Torna/desfaz a parceria pelo balão. Atualiza todos os pontos do concorrente
  // (matriz + filiais) — a estrela do pino muda na hora.
  async function alternarParceria(p: Ponto) {
    setSalvandoParceria(p.id);
    try {
      const res = await fetch(`/api/marketing/concorrentes/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ehParceiro: !p.ehParceiro }),
      });
      if (res.ok) {
        const novo = (await res.json()).data.ehParceiro as boolean;
        setPontos((prev) => prev.map((pt) => (pt.id === p.id ? { ...pt, ehParceiro: novo } : pt)));
      }
    } finally {
      setSalvandoParceria(null);
    }
  }
  // Visibilidade por categoria (persistida por usuário). Merge sobre o default
  // p/ categorias novas não sumirem quando o valor salvo for antigo.
  const [visiveisSalvo, setVisiveis] = usePersistedState<Partial<Record<ChaveVisibilidade, boolean>>>("geomkt-visibilidade", TODAS_VISIVEIS);
  const visiveis = useMemo(() => ({ ...TODAS_VISIVEIS, ...visiveisSalvo }), [visiveisSalvo]);
  const visiveisPontos = useMemo(
    () => pontos.filter((p) => visiveis[categoriaDe(p)] && (visiveis.parceiro || !ehParceiro(p))),
    [pontos, visiveis],
  );
  const algumaOculta = LEGENDA.some((l) => !visiveis[l.cat]);

  useEffect(() => {
    fetch("/api/marketing/concorrentes/geo")
      .then((r) => r.json())
      .then((j) => setPontos(j.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const centro = useMemo<[number, number]>(() => {
    const base = visiveisPontos.length ? visiveisPontos : pontos;
    if (base.length === 0) return CENTRO_BRASIL;
    const lat = base.reduce((s, p) => s + p.latitude, 0) / base.length;
    const lng = base.reduce((s, p) => s + p.longitude, 0) / base.length;
    return [lat, lng];
  }, [pontos, visiveisPontos]);

  // Contagem por categoria (cores) + parceiros (estrela, transversal).
  const contagem = useMemo(() => {
    const c: Record<ChaveVisibilidade, number> = { construtora: 0, consumidor: 0, fornecedor: 0, revendedor: 0, ambos: 0, parceiro: 0 };
    for (const p of pontos) {
      c[categoriaDe(p)]++;
      if (ehParceiro(p)) c.parceiro++;
    }
    return c;
  }, [pontos]);

  if (loading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="relative h-full w-full">
      <MapContainer center={centro} zoom={pontos.length ? 9 : 4} scrollWheelZoom className="h-full w-full rounded-xl z-0">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds pontos={visiveisPontos} />
        {visiveisPontos.map((p) => {
          const nome = p.nomeFantasia || p.razaoSocial;
          // Só mostra o nome do local quando agrega informação (≠ do nome e ≠ "Matriz").
          const localExtra = p.localNome && p.localNome !== "Matriz" && p.localNome.trim().toLowerCase() !== nome.trim().toLowerCase() ? p.localNome : null;
          return (
          <Marker key={p.localId} position={[p.latitude, p.longitude]} icon={iconeDe(p)}>
            <Tooltip>{nome}{localExtra ? ` · ${localExtra}` : ""}</Tooltip>
            <Popup>
              <div className="space-y-1">
                <p className="font-semibold text-sm">{nome}</p>
                {localExtra && <p className="text-[11px] text-gray-500">{localExtra}</p>}
                <p className="text-xs text-gray-600">{[p.cidade, p.estado].filter(Boolean).join("/") || "—"}</p>
                <div className="flex flex-wrap gap-1 text-[11px]">
                  {p.ehFornecedor && <span className="inline-flex items-center gap-0.5 text-amber-700">Fornecedor</span>}
                  {p.ehFornecedor && p.ehRevendedor && <span>·</span>}
                  {p.ehRevendedor && <span className="inline-flex items-center gap-0.5 text-blue-700">Revendedor</span>}
                  {p.ehConstrutora && <span className="inline-flex items-center gap-0.5 text-orange-700">· Construtora</span>}
                  {p.ehConsumidorFinal && <span className="inline-flex items-center gap-0.5 text-fuchsia-700">· Consumidor final</span>}
                  {ehParceiro(p) && <span className="inline-flex items-center gap-0.5 text-emerald-700">· Parceiro</span>}
                </div>
                <p className="text-xs text-gray-600">{p._count.precos} preço(s) mapeado(s)</p>
                <button
                  onClick={() => alternarParceria(p)}
                  disabled={salvandoParceria === p.id}
                  className={cn(
                    "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full border transition-colors disabled:opacity-50",
                    p.ehParceiro
                      ? "border-gray-300 text-gray-600 hover:bg-gray-100"
                      : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                  )}
                >
                  <Star className="h-3 w-3" fill={p.ehParceiro ? "none" : "currentColor"} strokeWidth={p.ehParceiro ? 2 : 0} />
                  {salvandoParceria === p.id ? "Salvando..." : p.ehParceiro ? "Desfazer parceria" : "Tornar parceiro"}
                </button>
                <br />
                <Link href={`/marketing/inteligencia-comercial/${p.id}`} className="text-xs text-blue-600 font-medium">Abrir cadastro →</Link>
              </div>
            </Popup>
          </Marker>
          );
        })}
      </MapContainer>

      {/* Legenda + filtro de visibilidade: clicar numa categoria oculta/mostra os pinos dela. */}
      <div className="absolute bottom-4 right-4 z-[400] bg-card/95 backdrop-blur border border-border rounded-lg shadow-lg px-3 py-2 text-xs space-y-0.5 min-w-[200px]">
        <div className="flex items-center justify-between mb-1">
          <p className="font-semibold text-foreground">Visibilidade</p>
          {algumaOculta ? (
            <button onClick={() => setVisiveis(TODAS_VISIVEIS)} className="text-primary font-medium hover:underline">mostrar tudo</button>
          ) : (
            <span className="text-muted-foreground tabular-nums">{pontos.length} no total</span>
          )}
        </div>
        {LEGENDA.map(({ cat, label, Icon }) => {
          const ligada = visiveis[cat];
          const parceiro = cat === "parceiro";
          return (
            <button
              key={cat}
              onClick={() => setVisiveis((v) => ({ ...TODAS_VISIVEIS, ...v, [cat]: !ligada }))}
              title={ligada ? "Clique para ocultar no mapa" : "Clique para mostrar no mapa"}
              className={cn("flex w-full items-center gap-2 rounded px-1 py-0.5 -mx-1 text-left text-muted-foreground hover:bg-muted transition-colors", !ligada && "opacity-40")}
            >
              {parceiro ? (
                // Amostra do pino parceiro: círculo neutro com a estrela dentro.
                <span className="inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-muted-foreground/60">
                  <Star className="h-2 w-2 text-white" fill="currentColor" strokeWidth={0} />
                </span>
              ) : (
                <span className={cn("inline-block h-3 w-3 rounded-full shrink-0", !ligada && "border-2")} style={{ background: ligada ? COR[cat] : "transparent", borderColor: COR[cat] }} />
              )}
              {Icon && !parceiro && <Icon className="h-3 w-3 shrink-0" />}
              <span className={cn(!ligada && "line-through")}>{label}</span>
              <span className="ml-auto pl-3 tabular-nums font-semibold text-foreground">{contagem[cat]}</span>
            </button>
          );
        })}
      </div>

      {pontos.length === 0 && (
        <div className="absolute inset-0 z-[400] flex items-center justify-center pointer-events-none">
          <div className="bg-card/95 border border-border rounded-lg px-4 py-3 text-sm text-muted-foreground shadow pointer-events-auto">
            Nenhum competidor georreferenciado ainda. Cadastre o endereço e use “Localizar no mapa”.
          </div>
        </div>
      )}
    </div>
  );
}
