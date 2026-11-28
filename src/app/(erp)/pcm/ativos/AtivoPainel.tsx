"use client";

// Detalhe do ativo (popup na árvore ou tela própria /pcm/ativos/[codApl]):
// cabeçalho + abas internas (Ficha, OS, Indicadores, Planos e medidores,
// Sobressalentes). Ações: editar, novo filho, inativar/excluir.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { Autoria } from "@/components/shared/Autoria";
import CriticidadeBadge from "@/components/pcm/CriticidadeBadge";
import { cn } from "@/lib/utils";
import { Loader2, Pencil, Plus, Trash2, X, RotateCcw, ExternalLink, FileText, Wrench, Activity, CalendarClock, Package, QrCode } from "lucide-react";
import { usePersistedState } from "@/lib/use-persisted-state";
import { useTabTitle } from "@/lib/tabs-context";
import { type AtivoFicha } from "./AtivoFormDialog";
import { TIPO_ATIVO_LABEL, ehAgrupador } from "@/lib/manutencao/tipos-ativo";
import AtivoPecas from "@/components/manutencao/AtivoPecas";
import AtivoIndicadores from "@/components/manutencao/AtivoIndicadores";

type Detalhe = AtivoFicha & {
  criticidade: "A" | "B" | "C" | null;
  regimeHorasDia: number | null;
  pai: { id: string; codApl: number; tag: string; nome: string } | null;
  familia: { id: string; nome: string } | null;
  setor: { id: string; nome: string } | null;
  centroCusto: { id: string; codigo: string; nome: string } | null;
  imobilizado: { id: string; descricao: string } | null;
  fornecedor: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  _count: { filhos: number; ordens: number; solicitacoes: number };
  ordens: {
    id: string; numero: string; status: string; prioridade: string; descricao: string;
    createdAt: string; concluidaEm: string | null; encerradaEm: string | null; canceladaEm: string | null;
    programadaPara: string | null; tipo: { sigla: string; nome: string };
  }[];
  planos: {
    id: string; gatilho: string; intervaloDias: number | null; intervaloMedida: string | null; ativo: boolean;
    ultimaExecucao: string | null; proximoVencimento: string | null; proximaMedida: string | null;
    plano: { id: string; codigo: string; nome: string; ativo: boolean };
    medidor: { nome: string; unidade: string } | null;
  }[];
  medidores: {
    id: string; nome: string; unidade: string; acumulado: string; ativo: boolean;
    ultimaLeitura: { data: string; valor: string } | null;
  }[];
  maquinasSst: { id: string; nome: string }[];
  centrosTrabalho: { id: string; codigo: string; nome: string }[];
};

type AbaAtivo = "ficha" | "os" | "indicadores" | "planos" | "pecas";

const STATUS_OS_LABEL: Record<string, string> = {
  ABERTA: "Aberta", PLANEJADA: "Planejada", EM_EXECUCAO: "Em execução", PAUSADA: "Pausada",
  AGUARDANDO_MATERIAL: "Aguard. material", AGUARDANDO_TERCEIRO: "Aguard. terceiro",
  ENCERRADA: "Encerrada", CONCLUIDA: "Concluída", CANCELADA: "Cancelada",
};
const STATUS_OS_COR: Record<string, string> = {
  CONCLUIDA: "bg-success/10 text-success",
  CANCELADA: "bg-muted text-muted-foreground",
  ENCERRADA: "bg-info/10 text-info",
};

const fmtData = (d: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const fmtNum = (v: string | number | null) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground truncate">{children || <span className="text-muted-foreground/60">—</span>}</p>
    </div>
  );
}

function Bloco({ titulo, children, extra, semBorda }: { titulo: string; children: React.ReactNode; extra?: React.ReactNode; semBorda?: boolean }) {
  return (
    <section className={cn(!semBorda && "border-t border-border pt-3")}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

const FINALIZADAS = new Set(["CONCLUIDA", "ENCERRADA", "CANCELADA"]);
type OSLinha = Detalhe["ordens"][number];

function ListaOS({ ordens, data }: { ordens: OSLinha[]; data: (o: OSLinha) => string }) {
  return (
    <ul className="divide-y divide-border">
      {ordens.map((o) => (
        <li key={o.id} className="flex items-start gap-3 text-sm py-2">
          <Link href={`/pcm/os/${o.id}`} className="font-mono font-semibold text-info hover:underline shrink-0">{o.numero}</Link>
          <span className="text-muted-foreground shrink-0" title={o.tipo.nome}>{o.tipo.sigla}</span>
          <span className="flex-1 min-w-0 truncate text-foreground" title={o.descricao}>{o.descricao}</span>
          <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[11px]", STATUS_OS_COR[o.status] ?? "bg-warning/10 text-warning")}>
            {STATUS_OS_LABEL[o.status] ?? o.status}
          </span>
          <span className="shrink-0 w-28 text-right text-muted-foreground tabular-nums">{data(o)}</span>
        </li>
      ))}
    </ul>
  );
}

function GrupoOS({ titulo, ordens, vazio, data }: { titulo: string; ordens: OSLinha[]; vazio: string; data: (o: OSLinha) => string }) {
  return (
    <section className="first:border-t-0 first:pt-0 border-t border-border pt-3">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo} ({ordens.length})</h3>
      {ordens.length === 0 ? <p className="text-xs text-muted-foreground italic py-1">{vazio}</p> : <ListaOS ordens={ordens} data={data} />}
    </section>
  );
}

export function StatusAtivoBadge({ status, ativo }: { status: string; ativo: boolean }) {
  if (!ativo) return <span className="rounded-full px-2 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground">Inativo</span>;
  return status === "PARADO" ? (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-danger/15 text-danger">Parado</span>
  ) : (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-medium bg-success/10 text-success">Operando</span>
  );
}

export default function AtivoPainel({
  codApl,
  versao,
  onFechar,
  onEditar,
  onNovoFilho,
  onAlterado,
  modo = "popup",
  onAbrirEmJanela,
}: {
  codApl: number;
  /** "pagina": tela própria /pcm/ativos/[codApl] (sem X, título da aba). */
  modo?: "popup" | "pagina";
  /** Presente no popup: mostra "Abrir em janela". */
  onAbrirEmJanela?: () => void;
  /** muda após salvar algo — força recarregar. */
  versao: number;
  onFechar: () => void;
  onEditar: (a: AtivoFicha) => void;
  onNovoFilho: (paiId: string) => void;
  onAlterado: () => void;
}) {
  const [d, setD] = useState<Detalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aviso, setAviso] = useState("");
  const [aba, setAba] = usePersistedState<AbaAtivo>("pcm:ativo:aba", "ficha");
  const pagina = modo === "pagina";
  useTabTitle(pagina && d ? `${d.tag} — ${d.nome}` : null);

  const load = useCallback(async () => {
    setLoading(true);
    setErro("");
    const res = await fetch(`/api/pcm/ativos/${codApl}`).catch(() => null);
    const j = await res?.json().catch(() => null);
    if (!res?.ok) { setErro(j?.error || "Não foi possível carregar o ativo."); setD(null); }
    else setD(j.data);
    setLoading(false);
  }, [codApl]);

  useEffect(() => { setAviso(""); load(); }, [load, versao]);

  async function excluir() {
    setSaving(true);
    const res = await fetch(`/api/pcm/ativos/${codApl}`, { method: "DELETE" }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setSaving(false);
    setConfirmar(false);
    if (!res?.ok) { setErro(j?.error || "Não foi possível excluir."); return; }
    if (j.data?.excluido) { onAlterado(); onFechar(); return; }
    setAviso(`Ativo inativado (não excluído): tem ${(j.data?.motivos ?? []).join(", ")}.`);
    onAlterado();
    load();
  }

  async function reativar() {
    setSaving(true);
    await fetch(`/api/pcm/ativos/${codApl}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: true }),
    }).catch(() => null);
    setSaving(false);
    setAviso("");
    onAlterado();
    load();
  }

  if (loading && !d) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (!d) {
    return (
      <div className="p-4 text-sm">
        <div className="flex justify-end"><button onClick={onFechar} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button></div>
        <p className="text-danger">{erro || "Ativo não encontrado."}</p>
      </div>
    );
  }

  const temHistorico = d._count.ordens > 0 || d._count.solicitacoes > 0 || d._count.filhos > 0 || d.planos.length > 0 || d.medidores.length > 0
    || d.maquinasSst.length > 0 || d.centrosTrabalho.length > 0;

  const abas: { key: AbaAtivo; label: string; icon: typeof FileText; count?: number }[] = [
    { key: "ficha", label: "Ficha", icon: FileText },
    { key: "os", label: "Ordens de serviço", icon: Wrench, count: d._count.ordens },
    ...(!ehAgrupador(d.tipo) ? [{ key: "indicadores" as const, label: "Indicadores", icon: Activity }] : []),
    { key: "planos", label: "Planos e medidores", icon: CalendarClock, count: d.planos.length + d.medidores.length },
    { key: "pecas", label: "Sobressalentes", icon: Package },
  ];
  const abaAtual: AbaAtivo = abas.some((a) => a.key === aba) ? aba : "ficha";

  return (
    <div className={cn("flex flex-col", pagina ? "" : "h-full min-h-0")}>
      {/* Cabeçalho */}
      <div className={cn("border-b border-border space-y-3 shrink-0", pagina ? "px-8 pt-6" : "px-6 pt-5")}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs text-muted-foreground">{d.tag} · #{d.codApl}</p>
            <h2 className={cn("font-semibold text-foreground leading-tight", pagina ? "text-xl" : "text-lg")}>{d.nome}</h2>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <StatusAtivoBadge status={d.status} ativo={d.ativo} />
              <span className="rounded-full px-2 py-0.5 text-[11px] bg-muted text-muted-foreground">{TIPO_ATIVO_LABEL[d.tipo] ?? d.tipo}</span>
              {d.criticidade && <CriticidadeBadge value={d.criticidade} />}
              {d.regimeHorasDia != null && <span className="text-[11px] text-muted-foreground">{d.regimeHorasDia}h/dia</span>}
              {d.pai && <span className="text-[11px] text-muted-foreground">· em {d.pai.tag} — {d.pai.nome}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onEditar(d)}><Pencil className="w-3.5 h-3.5" /> Editar</Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onNovoFilho(d.id)}><Plus className="w-3.5 h-3.5" /> Novo abaixo</Button>
            {d.ativo ? (
              <Button size="sm" variant="outline" className="gap-1.5 text-danger border-danger/30 hover:bg-danger/10" onClick={() => setConfirmar(true)}>
                <Trash2 className="w-3.5 h-3.5" /> {temHistorico ? "Inativar" : "Excluir"}
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="gap-1.5" disabled={saving} onClick={reativar}><RotateCcw className="w-3.5 h-3.5" /> Reativar</Button>
            )}
            <Button size="sm" variant="outline" className="gap-1.5" asChild title="Imprimir a etiqueta QR deste ativo">
              <Link href={`/pcm/ativos/etiquetas?ativo=${d.id}`}><QrCode className="w-3.5 h-3.5" /> Etiqueta QR</Link>
            </Button>
            {onAbrirEmJanela && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={onAbrirEmJanela} title="Abrir o ativo em tela própria">
                <ExternalLink className="w-3.5 h-3.5" /> Abrir em janela
              </Button>
            )}
            {!pagina && (
              <button onClick={onFechar} className="ml-1 text-muted-foreground hover:text-foreground" title="Fechar"><X className="w-4 h-4" /></button>
            )}
          </div>
        </div>

        {aviso && <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">{aviso}</p>}
        {erro && <p className="text-xs text-danger">{erro}</p>}

        {/* Abas internas */}
        <nav className="flex flex-wrap items-center gap-1 -mb-px">
          {abas.map((a) => {
            const Icon = a.icon;
            const ativa = abaAtual === a.key;
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => setAba(a.key)}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 text-sm border-b-2 transition-colors",
                  ativa ? "border-primary text-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="w-4 h-4" />
                {a.label}
                {!!a.count && <span className="text-xs text-muted-foreground">{a.count}</span>}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Conteúdo da aba */}
      <div className={cn("bg-muted/50 dark:bg-background", pagina ? "min-h-[calc(100vh-260px)] p-8" : "flex-1 min-h-0 overflow-y-auto p-6")}>
        <div className="rounded-xl border border-border bg-card shadow-sm p-5 space-y-4">
          {abaAtual === "ficha" && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
                <Campo label="Pai">{d.pai ? `${d.pai.tag} — ${d.pai.nome}` : "Raiz"}</Campo>
                <Campo label="Família">{d.familia?.nome}</Campo>
                <Campo label="Localização">{d.localizacao}</Campo>
                <Campo label="Setor">{d.setor?.nome}</Campo>
                <Campo label="Centro de custo">{d.centroCusto ? `${d.centroCusto.codigo} — ${d.centroCusto.nome}` : null}</Campo>
                <Campo label="Imobilizado">{d.imobilizado?.descricao}</Campo>
                <Campo label="Fornecedor">{d.fornecedor ? d.fornecedor.nomeFantasia || d.fornecedor.razaoSocial : null}</Campo>
                <Campo label="Fabricante / modelo">{[d.fabricante, d.modelo].filter(Boolean).join(" · ")}</Campo>
                <Campo label="Nº de série">{d.numeroSerie}</Campo>
                <Campo label="Patrimônio">{d.numeroPatrimonio}</Campo>
                {(d.placa || d.tipo === "VEICULO") && <Campo label="Placa">{d.placa}</Campo>}
                <Campo label="Ano de fabricação">{d.anoFabricacao}</Campo>
                <Campo label="Aquisição">{d.dataAquisicao ? fmtData(d.dataAquisicao) : null}</Campo>
                <Campo label="Garantia até">{d.garantiaAte ? fmtData(d.garantiaAte) : null}</Campo>
              </div>
              {d.observacoes && (
                <Bloco titulo="Observações">
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{d.observacoes}</p>
                </Bloco>
              )}
              {(d.maquinasSst.length > 0 || d.centrosTrabalho.length > 0) && (
                <Bloco titulo="Vínculos">
                  <ul className="space-y-1 text-xs">
                    {d.maquinasSst.map((m) => (
                      <li key={m.id}>
                        <Link href={`/sst/maquinas/${m.id}`} className="text-info hover:underline inline-flex items-center gap-1">
                          SST · NR-12: {m.nome} <ExternalLink className="w-3 h-3" />
                        </Link>
                      </li>
                    ))}
                    {d.centrosTrabalho.map((c) => (
                      <li key={c.id} className="text-foreground">PCP · Centro de trabalho {c.codigo} — {c.nome}</li>
                    ))}
                  </ul>
                </Bloco>
              )}
              <Autoria criadoPor={d.criadoPor} atualizadoPor={d.atualizadoPor} criadoEm={d.createdAt} atualizadoEm={d.updatedAt} className="pt-2" />
            </>
          )}

          {abaAtual === "os" && (() => {
            const proximas = d.ordens.filter((o) => !FINALIZADAS.has(o.status));
            const executadas = d.ordens.filter((o) => o.status === "CONCLUIDA" || o.status === "ENCERRADA");
            const canceladas = d.ordens.filter((o) => o.status === "CANCELADA");
            return d.ordens.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Nenhuma OS para este ativo.</p>
            ) : (
              <>
                <GrupoOS titulo="Próximas / em andamento" ordens={proximas} vazio="Nenhuma OS pendente." data={(o) => o.programadaPara ? `prog. ${fmtData(o.programadaPara)}` : fmtData(o.createdAt)} />
                <GrupoOS titulo="Executadas" ordens={executadas} vazio="Nenhuma OS executada." data={(o) => fmtData(o.concluidaEm ?? o.encerradaEm ?? o.createdAt)} />
                {canceladas.length > 0 && (
                  <details className="border-t border-border pt-3 group/canc">
                    <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground select-none">
                      Canceladas ({canceladas.length})
                    </summary>
                    <div className="mt-2 opacity-70">
                      <ListaOS ordens={canceladas} data={(o) => fmtData(o.canceladaEm ?? o.createdAt)} />
                    </div>
                  </details>
                )}
                {d._count.ordens > d.ordens.length && (
                  <p className="text-xs text-muted-foreground">Finalizadas: mostrando as {d.ordens.length - proximas.length} mais recentes de {d._count.ordens - proximas.length}.</p>
                )}
              </>
            );
          })()}

          {abaAtual === "indicadores" && <AtivoIndicadores ativoId={d.id} />}

          {abaAtual === "planos" && (
            <>
              <Bloco titulo={`Planos aplicados (${d.planos.length})`} semBorda>
                {d.planos.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nenhum plano aplicado.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {d.planos.map((p) => {
                      const ativo = p.ativo && p.plano.ativo;
                      const intervalo = p.gatilho === "MEDIDOR"
                        ? `a cada ${fmtNum(p.intervaloMedida)} ${p.medidor?.unidade ?? ""}`.trim()
                        : p.intervaloDias ? `a cada ${p.intervaloDias} dias` : "";
                      const proximo = p.gatilho === "MEDIDOR" ? (p.proximaMedida ? `${fmtNum(p.proximaMedida)} ${p.medidor?.unidade ?? ""}` : "—") : fmtData(p.proximoVencimento);
                      return (
                        <li key={p.id} className={cn("flex items-start gap-2 text-sm", !ativo && "opacity-50")}>
                          <span className="font-mono text-muted-foreground shrink-0">{p.plano.codigo}</span>
                          <span className="flex-1 min-w-0">
                            <span className="text-foreground">{p.plano.nome}</span>
                            {intervalo && <span className="text-muted-foreground"> · {intervalo}</span>}
                            {!ativo && <span className="text-muted-foreground"> · inativo</span>}
                          </span>
                          <span className="shrink-0 text-muted-foreground">próx. {proximo}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Bloco>
              <Bloco titulo={`Medidores (${d.medidores.length})`}>
                {d.medidores.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nenhum medidor.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {d.medidores.map((m) => (
                      <li key={m.id} className={cn("flex items-center gap-2 text-sm", !m.ativo && "opacity-50")}>
                        <span className="flex-1 text-foreground">{m.nome}</span>
                        <span className="tabular-nums font-medium text-foreground">{fmtNum(m.acumulado)} {m.unidade}</span>
                        <span className="text-muted-foreground">
                          {m.ultimaLeitura ? `últ. ${fmtData(m.ultimaLeitura.data)}` : "sem leitura"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Bloco>
            </>
          )}

          {abaAtual === "pecas" && <AtivoPecas codApl={d.codApl} />}
        </div>
      </div>

      <ConfirmDialog
        open={confirmar}
        onOpenChange={setConfirmar}
        title={temHistorico ? "Inativar ativo?" : "Excluir ativo?"}
        description={
          temHistorico
            ? `${d.tag} — ${d.nome} tem histórico (OS, planos, medidores ou filhos): será INATIVADO e sai das listas, mantendo o histórico.`
            : `${d.tag} — ${d.nome} não tem histórico e será excluído.`
        }
        onConfirm={excluir}
        loading={saving}
        confirmLabel={temHistorico ? "Inativar" : "Excluir"}
      />
    </div>
  );
}
