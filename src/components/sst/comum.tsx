"use client";

// Peças compartilhadas do módulo SST: semáforo, severidade, upload de anexo
// (vira Documento no GED), formatação e lookups dos formulários.
import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Paperclip, Loader2, FileText, X, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type Severidade = "CRITICA" | "ALTA" | "MEDIA" | "BAIXA";
export type Pendencia = {
  tipo: string; severidade: Severidade; titulo: string; detalhe?: string;
  colaboradorId?: string; colaboradorNome?: string; referenciaId?: string; vence?: string | null; link: string;
};

export const fmtData = (v?: string | Date | null) => (v ? new Date(v).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
export const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const SEVERIDADE: Record<Severidade, { label: string; cls: string; dot: string }> = {
  CRITICA: { label: "Crítica", cls: "bg-danger/10 text-danger border-danger/30", dot: "bg-danger" },
  ALTA:    { label: "Alta",    cls: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-300", dot: "bg-orange-500" },
  MEDIA:   { label: "Média",   cls: "bg-warning/10 text-warning border-warning/30", dot: "bg-warning" },
  BAIXA:   { label: "Baixa",   cls: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" },
};

export function SeveridadeBadge({ s }: { s: Severidade }) {
  const d = SEVERIDADE[s];
  return <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border", d.cls)}><span className={cn("w-1.5 h-1.5 rounded-full", d.dot)} />{d.label}</span>;
}

/** Selo de afastamento (benefício INSS, licença…) — substitui o semáforo: nada é cobrado. */
export const MOTIVO_AFASTAMENTO: Record<string, string> = { INSS_DOENCA: "benefício INSS", APOSENTADORIA_INVALIDEZ: "aposentadoria por incapacidade", ACIDENTE_TRABALHO: "acidente de trabalho", MATERNIDADE: "licença-maternidade", PATERNIDADE: "licença-paternidade", ATESTADO: "atestado", LICENCA: "licença", OUTRO: "afastado" };
export function SeloAfastado({ a }: { a: { desde: string | Date; ate?: string | Date | null; motivo?: string | null } }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border border-border bg-muted text-muted-foreground" title={`Afastado desde ${fmtData(a.desde)}${a.ate ? ` até ${fmtData(a.ate)}` : ""} — cobranças de SST suspensas`}>
      Afastado{a.motivo ? ` · ${MOTIVO_AFASTAMENTO[a.motivo] ?? a.motivo}` : ""}
    </span>
  );
}

export function Semaforo({ s, label = true }: { s: "OK" | "ATENCAO" | "CRITICO"; label?: boolean }) {
  const m = {
    OK: { cls: "bg-success/15 text-success", dot: "bg-success", t: "Regular" },
    ATENCAO: { cls: "bg-warning/15 text-warning", dot: "bg-warning", t: "Atenção" },
    CRITICO: { cls: "bg-danger/15 text-danger", dot: "bg-danger", t: "Pendente" },
  }[s];
  return <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full", m.cls)}><span className={cn("w-2 h-2 rounded-full", m.dot)} />{label && m.t}</span>;
}

export const TIPO_ASO: Record<string, string> = { ADMISSIONAL: "Admissional", PERIODICO: "Periódico", MUDANCA_FUNCAO: "Mudança de função", MUDANCA_RISCO: "Mudança de risco", RETORNO: "Retorno ao trabalho", DEMISSIONAL: "Demissional" };
export const RESULTADO_ASO: Record<string, { label: string; cls: string }> = {
  APTO: { label: "Apto", cls: "bg-success/15 text-success" },
  APTO_RESTRICOES: { label: "Apto c/ restrições", cls: "bg-warning/15 text-warning" },
  INAPTO: { label: "Inapto", cls: "bg-danger/15 text-danger" },
};
export const STATUS_MAQUINA: Record<string, { label: string; cls: string; dot: string }> = {
  NAO_AVALIADA: { label: "Não avaliada", cls: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
  NAO_CONFORME: { label: "Não conforme", cls: "bg-danger/15 text-danger", dot: "bg-danger" },
  EM_ADEQUACAO: { label: "Em adequação", cls: "bg-warning/15 text-warning", dot: "bg-warning" },
  CONFORME:     { label: "Conforme", cls: "bg-success/15 text-success", dot: "bg-success" },
  INTERDITADA:  { label: "Interditada", cls: "bg-danger text-white", dot: "bg-white" },
  DESATIVADA:   { label: "Desativada", cls: "bg-muted text-muted-foreground line-through", dot: "bg-muted-foreground" },
};
export function StatusMaquinaBadge({ s }: { s: string }) {
  const m = STATUS_MAQUINA[s] ?? STATUS_MAQUINA.NAO_AVALIADA;
  return <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full", m.cls)}><span className={cn("w-2 h-2 rounded-full", m.dot)} />{m.label}</span>;
}

export const TIPO_INCIDENTE: Record<string, { label: string; cls: string }> = {
  QUASE_ACIDENTE: { label: "Quase acidente", cls: "bg-muted text-muted-foreground" },
  ACIDENTE_SEM_AFASTAMENTO: { label: "Acidente sem afastamento", cls: "bg-warning/15 text-warning" },
  ACIDENTE_COM_AFASTAMENTO: { label: "Acidente com afastamento", cls: "bg-danger/15 text-danger" },
  TRAJETO: { label: "Acidente de trajeto", cls: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  DOENCA_OCUPACIONAL: { label: "Doença ocupacional", cls: "bg-danger/15 text-danger" },
};
export const STATUS_INCIDENTE: Record<string, { label: string; cls: string }> = {
  ABERTO: { label: "Aberto", cls: "bg-danger/15 text-danger" }, EM_INVESTIGACAO: { label: "Em investigação", cls: "bg-warning/15 text-warning" },
  ACAO_DEFINIDA: { label: "Ação definida", cls: "bg-info/15 text-info" }, ENCERRADO: { label: "Encerrado", cls: "bg-success/15 text-success" },
};
export const TIPOS_INSPECAO = ["EXTINTOR", "MAQUINA", "INSTALACAO", "ELETRICA", "ALTURA", "CHECKLIST_NR18", "CIPA", "OUTRO"];
export const TIPO_INSPECAO_LABEL: Record<string, string> = { EXTINTOR: "Extintores", MAQUINA: "Máquina", INSTALACAO: "Instalações", ELETRICA: "Elétrica", ALTURA: "Trabalho em altura", CHECKLIST_NR18: "Checklist NR-18", CIPA: "Inspeção da CIPA", OUTRO: "Outro" };

export const TIPO_ENTREGA: Record<string, string> = { ENTREGA: "Entrega", TROCA: "Troca", DEVOLUCAO: "Devolução" };

/** Lista de pendências (painel e ficha). */
export function ListaPendencias({ itens, mostrarColaborador = false, vazio = "Nenhuma pendência." }: { itens: Pendencia[]; mostrarColaborador?: boolean; vazio?: string }) {
  if (itens.length === 0) return <p className="text-sm text-muted-foreground italic px-1 py-2">{vazio}</p>;
  const ordem: Severidade[] = ["CRITICA", "ALTA", "MEDIA", "BAIXA"];
  const ordenadas = [...itens].sort((a, b) => ordem.indexOf(a.severidade) - ordem.indexOf(b.severidade));
  return (
    <ul className="divide-y divide-border/60">
      {ordenadas.map((p, i) => (
        <li key={i} className="flex items-start gap-3 py-2">
          <SeveridadeBadge s={p.severidade} />
          <div className="min-w-0 flex-1">
            <Link href={p.link} className="text-sm text-foreground hover:text-info">
              {mostrarColaborador && p.colaboradorNome && <span className="font-medium">{p.colaboradorNome} · </span>}{p.titulo}
            </Link>
            {p.detalhe && <p className="text-xs text-muted-foreground">{p.detalhe}</p>}
          </div>
          {p.vence && <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtData(p.vence)}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Lookups dos formulários (locais, categorias GED, usuários, itens). */
export type Lookups = { locais: { id: string; nome: string }[]; categorias: { id: string; nome: string; slug: string }[]; usuarios: { id: string; nome: string }[]; itens: { id: string; codigo: string; descricao: string; saldo?: number }[]; setores: { id: string; nome: string }[]; projetos: { id: string; nome: string }[]; maquinas: { id: string; nome: string; local: string | null }[] };
export function useLookups() {
  const [lk, setLk] = useState<Lookups>({ locais: [], categorias: [], usuarios: [], itens: [], setores: [], projetos: [], maquinas: [] });
  useEffect(() => { fetch("/api/sst/lookups").then((r) => r.json()).then((j) => j.data && setLk(j.data)).catch(() => {}); }, []);
  return lk;
}

/**
 * Upload de um anexo que vira Documento no GED (categoria SST do tipo) e
 * devolve o documentoId para gravar no registro. Controlado: value/onChange.
 */
export function UploadAnexo({ tipo, titulo, colaboradorId, validade, value, onChange, label = "Anexar arquivo" }: {
  tipo: "termo-epi" | "aso" | "exame" | "outro"; titulo: string; colaboradorId?: string | null; validade?: string | null;
  value: string | null; onChange: (documentoId: string | null) => void; label?: string;
}) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [nome, setNome] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  async function enviar(file: File) {
    setEnviando(true); setErro("");
    const fd = new FormData();
    fd.append("file", file); fd.append("tipo", tipo); fd.append("titulo", titulo || file.name);
    if (colaboradorId) fd.append("colaboradorId", colaboradorId);
    if (validade) fd.append("validade", validade);
    const res = await fetch("/api/sst/anexos", { method: "POST", body: fd }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setEnviando(false);
    if (!res?.ok) { setErro(j?.error || "Falha no upload"); return; }
    setNome(file.name); onChange(j.data.documentoId);
  }
  return (
    <div className="space-y-1">
      {value ? (
        <div className="flex items-center gap-2 text-sm">
          <FileText className="w-4 h-4 text-info" />
          <Link href={`/documentos/${value}`} className="text-info hover:underline truncate">{nome || "Anexo enviado"}</Link>
          <button type="button" onClick={() => { onChange(null); setNome(""); }} className="text-muted-foreground hover:text-danger" title="Remover"><X className="w-3.5 h-3.5" /></button>
        </div>
      ) : (
        <button type="button" disabled={enviando} onClick={() => ref.current?.click()} className="inline-flex items-center gap-1.5 text-sm text-info hover:underline disabled:opacity-60">
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />} {label}
        </button>
      )}
      <input ref={ref} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f); e.target.value = ""; }} />
      {erro && <p className="text-xs text-danger">{erro}</p>}
    </div>
  );
}

export function DocLink({ id, label = "Ver anexo" }: { id?: string | null; label?: string }) {
  if (!id) return <span className="text-xs text-muted-foreground/60">sem anexo</span>;
  return <Link href={`/documentos/${id}`} className="inline-flex items-center gap-1 text-xs text-info hover:underline"><FileText className="w-3 h-3" />{label}</Link>;
}

/** Menu de ações da linha (3 pontinhos): [{ label, icon?, onClick, danger?, href? }]. */
export type AcaoLinha = { label: string; icon?: React.ReactNode; onClick?: () => void; href?: string; danger?: boolean; separadorAntes?: boolean };
export function AcoesLinha({ acoes, title = "Ações" }: { acoes: AcaoLinha[]; title?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<button type="button" className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" title={title} />}>
        <MoreHorizontal className="w-4 h-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {acoes.map((a, i) => (
          <Fragment key={i}>
            {a.separadorAntes && <DropdownMenuSeparator />}
            {a.href ? (
              <DropdownMenuItem render={<Link href={a.href} target="_blank" />} variant={a.danger ? "destructive" : "default"}>{a.icon}{a.label}</DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={a.onClick} variant={a.danger ? "destructive" : "default"}>{a.icon}{a.label}</DropdownMenuItem>
            )}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
