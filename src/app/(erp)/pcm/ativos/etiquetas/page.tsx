"use client";

// Etiquetas QR dos ativos: escolhe os equipamentos (busca, tipo, ramo inteiro da
// árvore) e imprime uma grade de etiquetas — TAG grande, nome e o QR que abre a
// página PÚBLICA do ativo (/ativo/<qrToken>, sem login: histórico, OS abertas,
// saúde, planos e "solicitar manutenção"). Por ativo marcado: abrir a página
// pública e gerar um novo código (a etiqueta antiga deixa de funcionar).
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import { ExternalLink, GitBranch, Loader2, Printer, RefreshCw, Search } from "lucide-react";
import { api, useManutLookups, type AtivoLookup } from "@/components/manutencao/comum";

const TAMANHOS: Record<string, { label: string; w: number; h: number; qr: number; tag: number; nome: number }> = {
  P: { label: "Pequena — 50 × 30 mm", w: 50, h: 30, qr: 24, tag: 13, nome: 7 },
  M: { label: "Média — 70 × 40 mm", w: 70, h: 40, qr: 33, tag: 18, nome: 8.5 },
  G: { label: "Grande — 100 × 60 mm", w: 100, h: 60, qr: 50, tag: 26, nome: 11 },
};
const TIPOS = [
  { value: "", label: "Todos os tipos" },
  { value: "EQUIPAMENTO", label: "Equipamentos" },
  { value: "COMPONENTE", label: "Componentes" },
  { value: "VEICULO", label: "Veículos" },
  { value: "LOCAL", label: "Locais / áreas" },
];

type Linha = { a: AtivoLookup; nivel: number; temFilhos: boolean };

export default function EtiquetasQrPage() {
  useTabTitle("Etiquetas QR");
  const lk = useManutLookups();
  const carregando = lk.ativos.length === 0;
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = usePersistedState<string>("pcm.etiquetas.tipo", "");
  const [tamanho, setTamanho] = usePersistedState<string>("pcm.etiquetas.tamanho", "M");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [origem, setOrigem] = useState("");
  useEffect(() => { setOrigem(window.location.origin); }, []);

  // Código da etiqueta (qrToken) por ativo → link público /ativo/<qrToken>.
  const [tokens, setTokens] = useState<Record<string, string>>({});
  useEffect(() => { fetch("/api/pcm/ativos/qr").then((r) => r.json()).then((j) => j.data && setTokens(j.data)).catch(() => {}); }, []);
  const linkPublico = (a: AtivoLookup) => (tokens[a.id] && origem ? `${origem}/ativo/${tokens[a.id]}` : "");

  // "Gerar novo código": troca o qrToken (a etiqueta antiga para de funcionar).
  const [trocar, setTrocar] = useState<AtivoLookup | null>(null);
  const [trocando, setTrocando] = useState(false);
  const [aviso, setAviso] = useState("");
  async function gerarNovoCodigo() {
    if (!trocar) return;
    setTrocando(true);
    const r = await api<{ id: string; qrToken: string }>(`/api/pcm/ativos/${trocar.codApl}/qr`, "PATCH");
    setTrocando(false);
    if (!r.ok || !r.data) { setAviso(r.error || "Não foi possível gerar o novo código."); setTrocar(null); return; }
    const { id, qrToken } = r.data;
    setTokens((t) => ({ ...t, [id]: qrToken }));
    setQrs((m) => { const n = new Map(m); n.delete(id); return n; });
    setAviso(`Novo código gerado para ${trocar.tag}. Reimprima a etiqueta — a antiga deixou de funcionar.`);
    setTrocar(null);
  }

  const porId = useMemo(() => new Map(lk.ativos.map((a) => [a.id, a])), [lk.ativos]);

  // Árvore: filhos por pai e a ordem de exibição (pré-ordem, por TAG).
  const { filhos, ordem } = useMemo(() => {
    const ids = new Set(lk.ativos.map((a) => a.id));
    const filhos = new Map<string, AtivoLookup[]>();
    const raizes: AtivoLookup[] = [];
    for (const a of lk.ativos) {
      if (a.paiId && ids.has(a.paiId)) filhos.set(a.paiId, [...(filhos.get(a.paiId) ?? []), a]);
      else raizes.push(a);
    }
    const ordem: Linha[] = [];
    const visitar = (a: AtivoLookup, nivel: number) => {
      const fs = (filhos.get(a.id) ?? []).sort((x, y) => x.tag.localeCompare(y.tag));
      ordem.push({ a, nivel, temFilhos: fs.length > 0 });
      fs.forEach((f) => visitar(f, nivel + 1));
    };
    raizes.sort((x, y) => x.tag.localeCompare(y.tag)).forEach((r) => visitar(r, 0));
    return { filhos, ordem };
  }, [lk.ativos]);

  const ramo = (id: string): string[] => {
    const out = [id];
    for (let i = 0; i < out.length; i++) out.push(...(filhos.get(out[i]) ?? []).map((f) => f.id));
    return out;
  };

  // Busca/tipo filtram as linhas, mantendo os ancestrais para dar contexto.
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q && !tipo) return ordem;
    const casa = (a: AtivoLookup) =>
      (!tipo || a.tipo === tipo) &&
      (!q || a.tag.toLowerCase().includes(q) || a.nome.toLowerCase().includes(q) || (a.localizacao ?? "").toLowerCase().includes(q));
    const manter = new Set<string>();
    for (const { a } of ordem) {
      if (!casa(a)) continue;
      let cur: AtivoLookup | undefined = a;
      while (cur && !manter.has(cur.id)) { manter.add(cur.id); cur = cur.paiId ? porId.get(cur.paiId) : undefined; }
    }
    return ordem.filter((l) => manter.has(l.a.id));
  }, [ordem, busca, tipo, porId]);

  const casaFiltro = (a: AtivoLookup) => !tipo || a.tipo === tipo;
  function alternar(ids: string[], marcar: boolean) {
    setSel((s) => { const n = new Set(s); ids.forEach((id) => (marcar ? n.add(id) : n.delete(id))); return n; });
  }

  // Etiquetas na ordem da árvore + QR (data URL gerado no navegador).
  const escolhidos = useMemo(() => ordem.filter((l) => sel.has(l.a.id)).map((l) => l.a), [ordem, sel]);
  const [qrs, setQrs] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!origem) return;
    const faltam = escolhidos.filter((a) => !qrs.has(a.id) && tokens[a.id]);
    if (faltam.length === 0) return;
    let vivo = true;
    Promise.all(faltam.map(async (a) => [a.id, await QRCode.toDataURL(`${origem}/ativo/${tokens[a.id]}`, { margin: 0, width: 300, errorCorrectionLevel: "M" })] as const))
      .then((novos) => { if (vivo) setQrs((m) => new Map([...Array.from(m), ...novos])); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [escolhidos, origem, qrs, tokens]);

  const t = TAMANHOS[tamanho] ?? TAMANHOS.M;
  const prontas = escolhidos.every((a) => qrs.has(a.id));

  return (
    <div>
      <div className="no-print">
        <PageHeader
          title="Etiquetas QR"
          subtitle="Imprima etiquetas para colar nas máquinas: o QR abre a página pública do equipamento (sem login) com histórico, OS abertas, saúde, planos e o botão para pedir manutenção."
          breadcrumbs={[{ label: "Manutenção" }, { label: "Ativos", href: "/pcm/ativos" }, { label: "Etiquetas QR" }]}
          action={
            <Button onClick={() => window.print()} disabled={escolhidos.length === 0 || !prontas} className="bg-blue-600 hover:bg-blue-700 gap-1.5">
              <Printer className="w-4 h-4" /> Imprimir {escolhidos.length > 0 ? `(${escolhidos.length})` : ""}
            </Button>
          }
        />
      </div>

      <div className="px-8 pb-8 grid grid-cols-1 xl:grid-cols-[minmax(0,26rem)_1fr] gap-6">
        {/* Escolha dos ativos */}
        <div className="no-print bg-card border border-border rounded-xl flex flex-col max-h-[calc(100vh-12rem)]">
          <div className="p-3 border-b border-border space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por TAG, nome ou localização…"
                className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex gap-2">
              <SelectMenu value={tipo} onChange={setTipo} options={TIPOS} className="flex-1" />
              <SelectMenu value={tamanho} onChange={setTamanho} options={Object.entries(TAMANHOS).map(([value, v]) => ({ value, label: v.label }))} className="flex-1" />
            </div>
            <div className="flex items-center gap-3 text-xs">
              <button className="text-info hover:underline" onClick={() => alternar(visiveis.filter((l) => casaFiltro(l.a)).map((l) => l.a.id), true)}>Marcar os visíveis</button>
              <button className="text-muted-foreground hover:underline" onClick={() => setSel(new Set())}>Limpar</button>
              <span className="ml-auto text-muted-foreground">{sel.size} marcado(s)</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {carregando ? <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              : visiveis.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Nenhum ativo encontrado.</p>
              : visiveis.map(({ a, nivel, temFilhos }) => {
                const ids = temFilhos ? ramo(a.id).filter((id) => { const x = porId.get(id); return x ? casaFiltro(x) : false; }) : [];
                const ramoTodo = ids.length > 0 && ids.every((id) => sel.has(id));
                return (
                  <div key={a.id} className="flex items-center gap-2 px-3 py-1 hover:bg-muted/50 text-sm" style={{ paddingLeft: 12 + nivel * 16 }}>
                    <input type="checkbox" className="rounded shrink-0" checked={sel.has(a.id)} onChange={(e) => alternar([a.id], e.target.checked)} />
                    <span className={cn("font-mono text-xs shrink-0", casaFiltro(a) ? "text-foreground" : "text-muted-foreground/60")}>{a.tag}</span>
                    <span className={cn("truncate flex-1", casaFiltro(a) ? "text-foreground" : "text-muted-foreground/60")} title={a.nome}>{a.nome}</span>
                    {sel.has(a.id) && (
                      <span className="shrink-0 inline-flex items-center gap-0.5">
                        <a href={linkPublico(a) || undefined} target="_blank" rel="noopener noreferrer" title="Ver página pública"
                          className={cn("p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground", !linkPublico(a) && "pointer-events-none opacity-40")}>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button onClick={() => { setAviso(""); setTrocar(a); }} title="Gerar novo código (a etiqueta antiga deixa de funcionar)"
                          className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground">
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    )}
                    {temFilhos && (
                      <button onClick={() => alternar(ids, !ramoTodo)} title={ramoTodo ? "Desmarcar o ramo" : "Marcar este ramo inteiro"}
                        className={cn("shrink-0 inline-flex items-center gap-0.5 text-[11px] rounded px-1.5 py-0.5 border", ramoTodo ? "border-info/40 bg-info/10 text-info" : "border-border text-muted-foreground hover:bg-muted")}>
                        <GitBranch className="w-3 h-3" /> ramo
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        {/* Prévia = o que sai na impressão */}
        <div>
          {aviso && <p className="no-print mb-2 rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-xs text-info">{aviso}</p>}
          {escolhidos.length > 0 && (
            <p className="no-print text-xs text-muted-foreground mb-1">
              Nos ativos marcados à esquerda: <ExternalLink className="inline w-3 h-3" /> abre a página pública que o QR mostra; <RefreshCw className="inline w-3 h-3" /> gera um novo código.
            </p>
          )}
          <p className="no-print text-xs text-muted-foreground mb-2">
            {escolhidos.length === 0 ? "Marque os ativos à esquerda para montar as etiquetas." : `Prévia em tamanho real (${t.w} × ${t.h} mm). Na impressão, use escala 100% e sem margens extras.`}
          </p>
          <style>{`@media print { @page { size: A4 portrait; margin: 8mm; } }`}</style>
          <div className="print-area flex flex-wrap content-start" style={{ gap: "2mm" }}>
            {escolhidos.map((a) => (
              <div key={a.id} className="bg-white text-black flex items-center overflow-hidden"
                style={{ width: `${t.w}mm`, height: `${t.h}mm`, border: "0.3mm dashed #999", padding: "2mm", gap: "2mm", breakInside: "avoid", pageBreakInside: "avoid", fontFamily: "Arial, Helvetica, sans-serif" }}>
                {qrs.get(a.id)
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={qrs.get(a.id)} alt={`QR ${a.tag}`} style={{ width: `${t.qr}mm`, height: `${t.qr}mm`, flexShrink: 0 }} />
                  : <div style={{ width: `${t.qr}mm`, height: `${t.qr}mm`, flexShrink: 0, background: "#eee" }} />}
                <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div style={{ fontSize: `${t.tag}pt`, fontWeight: 800, lineHeight: 1.05, wordBreak: "break-all" }}>{a.tag}</div>
                  <div style={{ fontSize: `${t.nome}pt`, lineHeight: 1.2, marginTop: "1mm", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>{a.nome}</div>
                  <div style={{ fontSize: `${Math.max(5.5, t.nome - 2)}pt`, color: "#555", marginTop: "1mm" }}>Manutenção · aponte a câmera</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!trocar}
        onOpenChange={(o) => { if (!o && !trocando) setTrocar(null); }}
        title={`Gerar novo código para ${trocar?.tag ?? ""}?`}
        description="A etiqueta impressa hoje (e qualquer link da página pública que tenha circulado) deixa de funcionar na hora. Você vai precisar reimprimir e colar a etiqueta nova na máquina."
        confirmLabel="Gerar novo código"
        loading={trocando}
        onConfirm={gerarNovoCodigo}
      />
    </div>
  );
}
