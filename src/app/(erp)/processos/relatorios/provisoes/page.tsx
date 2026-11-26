"use client";

// Relatório de provisões por risco (CPC 25 / IAS 37) — fase 3 de docs/processos-prd.md.
// Processos ativos na data-base com valor em discussão, agrupados por risco de perda, tipo e
// empresa, para a contabilidade decidir provisão × nota explicativa. Só relatório: nada aqui
// gera lançamento contábil.
import { useMemo } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import DatePicker from "@/components/shared/DatePicker";
import { Button } from "@/components/ui/button";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { useRelatorioCache } from "@/lib/use-relatorio-cache";
import { gerarPdfContabil, type LinhaPdf } from "@/lib/pdf-contabil";
import { cn } from "@/lib/utils";
import { Download, FileDown, Loader2, Lock, RefreshCw } from "lucide-react";
import { RISCOS, SITUACOES, TIPOS_PROCESSO, fmtBRL, fmtData } from "@/components/processos/comum";

type Linha = {
  id: string; codigo: string; titulo: string; tipo: string; orgao: string; numero: string | null; polo: string | null; situacao: string;
  riscoPerda: string | null; valorCausa: number | null; abertoEm: string | null; confidencial: boolean; empresaId: string; empresa: string;
  natureza: "ATIVO" | "PASSIVO"; responsavel: string | null;
};
type Resp = { data: Linha[]; empresas: { id: string; nome: string }[]; dataBase: string };

const GRUPOS = [
  { k: "PROVAVEL", titulo: "Provável", regra: "Provisionar (reconhecer passivo e despesa) pelo valor estimado.", cls: "border-danger/30 bg-danger/5 text-danger" },
  { k: "POSSIVEL", titulo: "Possível", regra: "Não provisionar; divulgar em nota explicativa.", cls: "border-warning/30 bg-warning/5 text-warning" },
  { k: "REMOTA", titulo: "Remota", regra: "Não provisionar nem divulgar.", cls: "border-border bg-muted/40 text-muted-foreground" },
  { k: "SEM", titulo: "Sem classificação", regra: "Classificar o risco (e o valor) com o advogado antes do fechamento.", cls: "border-info/30 bg-info/5 text-info" },
] as const;
const grupoDe = (l: Linha) => (l.riscoPerda && RISCOS[l.riscoPerda] ? l.riscoPerda : "SEM");
const hoje = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
const brl = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ProvisoesPage() {
  useTabTitle("Provisões (CPC 25)");
  const [empresaId, setEmpresaId] = usePersistedState<string>("processos:provisoes:empresa", "todas");
  const [dataBase, setDataBase] = usePersistedState<string>("processos:provisoes:database", "");
  const base = dataBase || hoje();
  const url = `/api/processos/relatorios/provisoes?empresaId=${encodeURIComponent(empresaId)}&dataBase=${base}`;
  const { data, loading, refreshing, erro, recarregar } = useRelatorioCache<Resp & { error?: string }>(url);
  const linhas = useMemo(() => data?.data ?? [], [data]);

  const passivos = linhas.filter((l) => l.natureza === "PASSIVO");
  const ativos = linhas.filter((l) => l.natureza === "ATIVO");
  const soma = (ls: Linha[]) => ls.reduce((s, l) => s + (l.valorCausa ?? 0), 0);
  const porGrupo = (ls: Linha[]) => GRUPOS.map((g) => ({ ...g, lista: ls.filter((l) => grupoDe(l) === g.k) }));
  const gruposPassivo = porGrupo(passivos);
  const resumo = (chave: (l: Linha) => string, rotulo: (k: string) => string) => {
    type R = { PROVAVEL: number; POSSIVEL: number; REMOTA: number; SEM: number; n: number };
    const m = new Map<string, R>();
    for (const l of passivos) {
      const k = chave(l);
      const r: R = m.get(k) ?? { PROVAVEL: 0, POSSIVEL: 0, REMOTA: 0, SEM: 0, n: 0 };
      r[grupoDe(l) as keyof R] += l.valorCausa ?? 0; r.n += 1; m.set(k, r);
    }
    return Array.from(m.entries()).map(([k, r]) => ({ k, rotulo: rotulo(k), ...r })).sort((a, b) => b.PROVAVEL + b.POSSIVEL - (a.PROVAVEL + a.POSSIVEL));
  };
  const porTipo = resumo((l) => l.tipo, (k) => TIPOS_PROCESSO[k] ?? k);
  const porEmpresa = resumo((l) => l.empresa, (k) => k);
  const nomeEmpresa = empresaId === "todas" ? "Todas as empresas" : data?.empresas.find((e) => e.id === empresaId)?.nome ?? "";

  function exportarCsv() {
    const cab = ["Natureza", "Risco", "Código", "Título", "Tipo", "Órgão", "Número", "Polo", "Situação", "Empresa", "Aberto em", "Valor em discussão"];
    const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const corpo = linhas.map((l) => [
      l.natureza === "ATIVO" ? "Ativo contingente" : "Passivo contingente", GRUPOS.find((g) => g.k === grupoDe(l))!.titulo, l.codigo, l.titulo, TIPOS_PROCESSO[l.tipo] ?? l.tipo,
      l.orgao, l.numero ?? "", l.polo ?? "", SITUACOES[l.situacao]?.label ?? l.situacao, l.empresa, l.abertoEm ? fmtData(l.abertoEm) : "", l.valorCausa != null ? brl(l.valorCausa) : "",
    ].map((c) => esc(String(c))).join(";"));
    const blob = new Blob(["﻿" + [cab.join(";"), ...corpo].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `provisoes-cpc25-${base}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function exportarPdf() {
    const pdf: LinhaPdf[] = [];
    const bloco = (titulo: string, grupos: ReturnType<typeof porGrupo>) => {
      pdf.push({ celulas: [titulo, "", "", "", ""], estilo: "secao" });
      for (const g of grupos) {
        if (!g.lista.length) continue;
        pdf.push({ celulas: [`${g.titulo} — ${g.regra}`, "", "", "", brl(soma(g.lista))], estilo: "secao" });
        for (const l of g.lista) pdf.push({ celulas: [`${l.codigo} ${l.titulo}`, TIPOS_PROCESSO[l.tipo] ?? l.tipo, l.orgao, l.empresa, l.valorCausa != null ? brl(l.valorCausa) : "—"] });
      }
    };
    bloco("PASSIVOS CONTINGENTES / PROVISÕES", gruposPassivo);
    if (ativos.length) bloco("ATIVOS CONTINGENTES (empresa autora/requerente — não reconhecer)", porGrupo(ativos));
    pdf.push({ celulas: ["Total a provisionar (provável)", "", "", "", brl(soma(gruposPassivo[0].lista))], estilo: "total" });
    pdf.push({ celulas: ["Total a divulgar (possível)", "", "", "", brl(soma(gruposPassivo[1].lista))], estilo: "total" });
    await gerarPdfContabil({
      titulo: "Provisões por risco — CPC 25", empresa: nomeEmpresa, subinfo: [`Data-base: ${fmtData(base)}`, "Valor e risco conforme o cadastro atual dos processos. Relatório gerencial — não gera lançamento contábil."],
      head: ["Processo", "Tipo", "Órgão", "Empresa", "Valor (R$)"], linhas: pdf, alinharDireitaDe: 4, orientacao: "l", arquivo: `provisoes-cpc25-${base}.pdf`,
    });
  }

  return (
    <div>
      <PageHeader title="Provisões por risco (CPC 25)" subtitle="Processos ativos com valor em discussão, para o fechamento contábil" breadcrumbs={[{ label: "Processos", href: "/processos" }, { label: "Provisões (CPC 25)" }]}
        action={<div className="flex gap-2">
          <Button variant="outline" className="gap-1.5" onClick={exportarCsv} disabled={!linhas.length}><Download className="w-4 h-4" /> CSV</Button>
          <Button variant="outline" className="gap-1.5" onClick={exportarPdf} disabled={!linhas.length}><FileDown className="w-4 h-4" /> PDF</Button>
        </div>} />
      <div className="px-4 sm:px-8 pb-10 space-y-4">
        <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground leading-relaxed">
          <b className="text-foreground">Regra do CPC 25 (IAS 37).</b> Perda <b className="text-danger">provável</b> (mais provável que sim do que não) e valor estimável → <b>provisionar</b>: reconhece passivo e despesa.
          Perda <b className="text-warning">possível</b> → <b>não provisiona</b>, mas <b>divulga em nota explicativa</b> (natureza e valor estimado). Perda <b>remota</b> → não provisiona nem divulga.
          Quando a empresa é <b>autora/requerente</b> (ex.: restituição, indenização a receber), é <b>ativo contingente</b>: nunca se reconhece antes de ser praticamente certo; divulga-se se provável.
          O risco e o valor vêm da ficha de cada processo (campos “Risco de perda” e “Valor em discussão”) — confirme com o advogado antes de fechar o período.
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64"><div className="text-xs text-muted-foreground mb-1">Empresa</div>
            <SelectMenu value={empresaId} onChange={setEmpresaId} options={[{ value: "todas", label: "Todas as empresas" }, ...(data?.empresas ?? []).map((e) => ({ value: e.id, label: e.nome }))]} /></div>
          <div className="w-44"><div className="text-xs text-muted-foreground mb-1">Data-base</div><DatePicker value={base} onChange={(v) => setDataBase(v ?? "")} allowClear={false} /></div>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={recarregar}><RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} /> Atualizar</Button>
        </div>

        {loading ? <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          : erro || data?.error ? <p className="text-sm text-danger">{data?.error ?? erro}</p>
          : (<>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              {gruposPassivo.map((g) => (
                <div key={g.k} className={cn("rounded-xl border p-3", g.cls)}>
                  <div className="text-xs font-medium">{g.titulo} · {g.lista.length}</div>
                  <div className="text-lg font-semibold tabular-nums text-foreground">{fmtBRL(soma(g.lista))}</div>
                  <div className="text-[11px] text-muted-foreground leading-snug">{g.regra}</div>
                </div>
              ))}
            </div>

            <Tabela titulo="Passivos contingentes e provisões" grupos={gruposPassivo} soma={soma} />
            {ativos.length > 0 && <Tabela titulo="Ativos contingentes (empresa autora/requerente)" grupos={porGrupo(ativos)} soma={soma} />}

            <div className="grid gap-4 lg:grid-cols-2">
              <Resumo titulo="Por tipo" linhas={porTipo} />
              <Resumo titulo="Por empresa" linhas={porEmpresa} />
            </div>
            <p className="text-[11px] text-muted-foreground">Valor e risco são os do cadastro atual (o sistema não guarda histórico do risco por data). Processos sem valor entram com R$ 0,00. Confidenciais aparecem só para quem pode vê-los.</p>
          </>)}
      </div>
    </div>
  );
}

function Tabela({ titulo, grupos, soma }: { titulo: string; grupos: { k: string; titulo: string; regra: string; lista: Linha[] }[]; soma: (l: Linha[]) => number }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-x-auto">
      <div className="px-4 py-2.5 text-sm font-semibold border-b border-border">{titulo}</div>
      <table className="w-full text-sm">
        <thead className="bg-muted text-xs text-muted-foreground"><tr>
          <th className="text-left px-4 py-2 font-semibold">Processo</th><th className="text-left px-3 py-2 font-semibold">Tipo</th><th className="text-left px-3 py-2 font-semibold">Órgão</th>
          <th className="text-left px-3 py-2 font-semibold">Situação</th><th className="text-left px-3 py-2 font-semibold">Empresa</th><th className="text-right px-4 py-2 font-semibold">Valor</th>
        </tr></thead>
        <tbody>
          {grupos.filter((g) => g.lista.length).map((g) => (
            <GrupoLinhas key={g.k} g={g} total={soma(g.lista)} />
          ))}
          {grupos.every((g) => !g.lista.length) && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhum processo ativo nesta data-base.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function GrupoLinhas({ g, total }: { g: { k: string; titulo: string; regra: string; lista: Linha[] }; total: number }) {
  return (<>
    <tr className="bg-muted/50 border-t border-border"><td colSpan={5} className="px-4 py-1.5 text-xs font-semibold">{g.titulo} <span className="font-normal text-muted-foreground">— {g.regra}</span></td><td className="px-4 py-1.5 text-right text-xs font-semibold tabular-nums">{fmtBRL(total)}</td></tr>
    {g.lista.map((l) => (
      <tr key={l.id} className="border-t border-border/60">
        <td className="px-4 py-2"><Link href={`/processos/${l.id}`} className="hover:underline"><span className="font-mono text-xs">{l.codigo}</span> {l.titulo}</Link>{l.confidencial && <Lock className="w-3 h-3 inline ml-1 text-muted-foreground" />}{l.numero && <div className="text-[11px] text-muted-foreground font-mono">{l.numero}</div>}</td>
        <td className="px-3 py-2 text-xs">{TIPOS_PROCESSO[l.tipo] ?? l.tipo}</td>
        <td className="px-3 py-2 text-xs">{l.orgao}</td>
        <td className="px-3 py-2 text-xs">{SITUACOES[l.situacao]?.label ?? l.situacao}</td>
        <td className="px-3 py-2 text-xs">{l.empresa}</td>
        <td className="px-4 py-2 text-right tabular-nums">{l.valorCausa != null ? fmtBRL(l.valorCausa) : <span className="text-muted-foreground">sem valor</span>}</td>
      </tr>
    ))}
  </>);
}

function Resumo({ titulo, linhas }: { titulo: string; linhas: { k: string; rotulo: string; n: number; PROVAVEL: number; POSSIVEL: number; REMOTA: number; SEM: number }[] }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-x-auto">
      <div className="px-4 py-2.5 text-sm font-semibold border-b border-border">{titulo} <span className="text-xs font-normal text-muted-foreground">(passivos)</span></div>
      <table className="w-full text-sm">
        <thead className="bg-muted text-xs text-muted-foreground"><tr>
          <th className="text-left px-4 py-2 font-semibold"></th><th className="text-right px-3 py-2 font-semibold">Qtd.</th><th className="text-right px-3 py-2 font-semibold">Provável</th>
          <th className="text-right px-3 py-2 font-semibold">Possível</th><th className="text-right px-3 py-2 font-semibold">Remota</th><th className="text-right px-4 py-2 font-semibold">Sem class.</th>
        </tr></thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.k} className="border-t border-border/60 tabular-nums">
              <td className="px-4 py-1.5">{l.rotulo}</td><td className="px-3 py-1.5 text-right">{l.n}</td><td className="px-3 py-1.5 text-right">{fmtBRL(l.PROVAVEL)}</td>
              <td className="px-3 py-1.5 text-right">{fmtBRL(l.POSSIVEL)}</td><td className="px-3 py-1.5 text-right">{fmtBRL(l.REMOTA)}</td><td className="px-4 py-1.5 text-right">{fmtBRL(l.SEM)}</td>
            </tr>
          ))}
          {linhas.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">—</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
