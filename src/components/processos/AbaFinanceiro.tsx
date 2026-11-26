"use client";

// Aba "Financeiro" da ficha do processo (fase 2): títulos a pagar (custas, taxas, honorários,
// multas, depósitos judiciais) e a receber (restituição, indenização) ligados ao processo.
// "Novo lançamento" reaproveita o formulário do Contas a Pagar/Receber (LancamentoForm) já com
// o processo vinculado; "Vincular título" liga um título existente da mesma empresa.
// Só vínculo gerencial — não muda nenhuma regra contábil.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CreateDrawer from "@/components/shared/CreateDrawer";
import LancamentoForm from "@/components/financeiro/LancamentoForm";
import { cn } from "@/lib/utils";
import { ArrowDownLeft, ArrowUpRight, Link2, Loader2, Plus, ShieldAlert, X } from "lucide-react";
import { api, fmtBRL, fmtData } from "@/components/processos/comum";

type Titulo = {
  id: string; numero: string; descricao: string; valorOriginal: string; valorPago: string; status: string;
  dataVencimento: string | null; dataPagamento: string | null; beneficiario: string | null; naturezaFinanceira: { codigo: string | null; nome: string } | null;
};
type Resp = { podeVer: boolean; podeEditar: boolean; pagar: Titulo[]; receber: Titulo[]; totais: { pagarPago: number; pagarAberto: number; receberRecebido: number; receberAberto: number } | null };
type Tipo = "pagar" | "receber";

const STATUS: Record<string, { label: string; cls: string }> = {
  ABERTA: { label: "Em aberto", cls: "bg-warning/10 text-warning border-warning/30" },
  PARCIAL: { label: "Parcial", cls: "bg-info/10 text-info border-info/30" },
  PAGA: { label: "Quitado", cls: "bg-success/10 text-success border-success/30" },
};

export default function AbaFinanceiro({ processo, onContagem }: { processo: { id: string; codigo: string }; onContagem?: (n: number) => void }) {
  const [r, setR] = useState<Resp | null>(null);
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState<Tipo | null>(null);
  const [vincular, setVincular] = useState<Tipo | null>(null);

  const load = useCallback(async () => {
    const j = await fetch(`/api/processos/${processo.id}/financeiro`).then((x) => x.json()).catch(() => null);
    if (!j || j.error) { setErro(j?.error ?? "Erro ao carregar."); return; }
    setR(j); onContagem?.(j.pagar.length + j.receber.length);
  }, [processo.id, onContagem]);
  useEffect(() => { load(); }, [load]);

  async function desvincular(tipo: Tipo, t: Titulo) {
    if (!confirm(`Desligar ${t.numero} do processo? O título continua no financeiro.`)) return;
    const res = await api(`/api/processos/${processo.id}/financeiro?tipo=${tipo}&tituloId=${t.id}`, "DELETE");
    if (!res.ok) setErro(res.error ?? "Erro.");
    load();
  }

  if (!r) return <div className="bg-card border border-border rounded-xl p-8 flex justify-center">{erro ? <span className="text-sm text-danger">{erro}</span> : <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}</div>;
  if (!r.podeVer) return <div className="bg-card border border-border rounded-xl p-6 text-sm text-muted-foreground flex items-start gap-3"><ShieldAlert className="w-5 h-5 shrink-0" /> Os títulos do processo aparecem para quem também tem acesso ao módulo Financeiro.</div>;

  const t = r.totais!;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card label="Pago (custas, honorários…)" valor={t.pagarPago} />
        <Card label="A pagar em aberto" valor={t.pagarAberto} destaque={t.pagarAberto > 0 ? "warning" : undefined} />
        <Card label="Recebido" valor={t.receberRecebido} />
        <Card label="A receber em aberto" valor={t.receberAberto} />
      </div>
      {erro && <p className="text-sm text-danger">{erro}</p>}
      <Bloco titulo="A pagar" icone={<ArrowDownLeft className="w-4 h-4 text-danger" />} tipo="pagar" lista={r.pagar} pode={r.podeEditar} onNovo={() => setNovo("pagar")} onVincular={() => setVincular("pagar")} onDesvincular={desvincular}
        vazio="Nenhum título a pagar. Lance aqui custas, taxas (DAE, emolumentos), honorários, multas e depósitos judiciais." />
      <Bloco titulo="A receber" icone={<ArrowUpRight className="w-4 h-4 text-success" />} tipo="receber" lista={r.receber} pode={r.podeEditar} onNovo={() => setNovo("receber")} onVincular={() => setVincular("receber")} onDesvincular={desvincular}
        vazio="Nenhum título a receber (restituição, indenização, levantamento de depósito)." />
      <p className="text-[11px] text-muted-foreground">O vínculo com o processo é gerencial: a contabilização do título segue a natureza financeira, como em qualquer lançamento.</p>

      <CreateDrawer open={!!novo} onOpenChange={(o) => !o && setNovo(null)} title={novo === "receber" ? `Novo a receber — ${processo.codigo}` : `Novo a pagar — ${processo.codigo}`} width="lg" onCreated={load}>
        {novo && <LancamentoForm tipo={novo} processo={processo} />}
      </CreateDrawer>
      {vincular && <VincularDialog processoId={processo.id} tipo={vincular} onFechar={() => setVincular(null)} onFeito={() => { setVincular(null); load(); }} />}
    </div>
  );
}

function Card({ label, valor, destaque }: { label: string; valor: number; destaque?: "warning" }) {
  return (
    <div className={cn("rounded-xl border p-3 bg-card", destaque === "warning" ? "border-warning/40" : "border-border")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{fmtBRL(valor)}</div>
    </div>
  );
}

function Bloco({ titulo, icone, tipo, lista, pode, onNovo, onVincular, onDesvincular, vazio }: {
  titulo: string; icone: React.ReactNode; tipo: Tipo; lista: Titulo[]; pode: boolean; vazio: string;
  onNovo: () => void; onVincular: () => void; onDesvincular: (tipo: Tipo, t: Titulo) => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-x-auto">
      <div className="px-4 py-2.5 flex flex-wrap items-center gap-2 border-b border-border">
        <span className="text-sm font-semibold inline-flex items-center gap-1.5">{icone} {titulo}</span>
        {pode && <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={onVincular}><Link2 className="w-3.5 h-3.5" /> Vincular título existente</Button>
          <Button size="sm" className="gap-1.5 h-8" onClick={onNovo}><Plus className="w-3.5 h-3.5" /> Novo lançamento</Button>
        </div>}
      </div>
      {lista.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground text-center">{vazio}</p> : (
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs text-muted-foreground"><tr>
            <th className="text-left px-4 py-2 font-semibold">Título</th><th className="text-left px-3 py-2 font-semibold">{tipo === "pagar" ? "Fornecedor" : "Cliente"}</th>
            <th className="text-left px-3 py-2 font-semibold">Vencimento</th><th className="text-left px-3 py-2 font-semibold">Situação</th><th className="text-right px-3 py-2 font-semibold">Valor</th><th />
          </tr></thead>
          <tbody>
            {lista.map((t) => (
              <tr key={t.id} className="border-t border-border/60">
                <td className="px-4 py-2"><span className="font-mono text-xs">{t.numero}</span> {t.descricao}{t.naturezaFinanceira && <div className="text-[11px] text-muted-foreground">{t.naturezaFinanceira.codigo ? `${t.naturezaFinanceira.codigo} ` : ""}{t.naturezaFinanceira.nome}</div>}</td>
                <td className="px-3 py-2 text-xs">{t.beneficiario ?? "—"}</td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtData(t.dataVencimento)}{t.dataPagamento && <div className="text-[11px] text-muted-foreground">pago {fmtData(t.dataPagamento)}</div>}</td>
                <td className="px-3 py-2"><span className={cn("text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap", STATUS[t.status]?.cls ?? "border-border")}>{STATUS[t.status]?.label ?? t.status}</span></td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmtBRL(t.valorOriginal)}{Number(t.valorPago) > 0 && t.status !== "PAGA" && <div className="text-[11px] text-muted-foreground">pago {fmtBRL(t.valorPago)}</div>}</td>
                <td className="px-3 py-2 text-right">{pode && <button onClick={() => onDesvincular(tipo, t)} className="text-muted-foreground hover:text-danger" title="Desligar do processo"><X className="w-4 h-4" /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function VincularDialog({ processoId, tipo, onFechar, onFeito }: { processoId: string; tipo: Tipo; onFechar: () => void; onFeito: () => void }) {
  const [q, setQ] = useState("");
  const [lista, setLista] = useState<Titulo[] | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    const h = setTimeout(() => {
      fetch(`/api/processos/${processoId}/financeiro?tipo=${tipo}&buscar=${encodeURIComponent(q)}`).then((x) => x.json()).then((j) => setLista(j.data ?? [])).catch(() => setLista([]));
    }, 250);
    return () => clearTimeout(h);
  }, [processoId, tipo, q]);
  async function ligar(t: Titulo) {
    const res = await api(`/api/processos/${processoId}/financeiro`, "POST", { tipo, tituloId: t.id });
    if (!res.ok) { setErro(res.error ?? "Erro."); return; }
    onFeito();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Vincular título {tipo === "pagar" ? "a pagar" : "a receber"}</DialogTitle></DialogHeader>
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar por número, descrição ou ${tipo === "pagar" ? "fornecedor" : "cliente"}…`} />
        {erro && <p className="text-sm text-danger">{erro}</p>}
        <div className="max-h-96 overflow-y-auto -mx-1">
          {lista === null ? <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            : lista.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">Nenhum título sem processo encontrado nesta empresa.</p>
            : <ul className="divide-y divide-border/60">{lista.map((t) => (
              <li key={t.id}>
                <button onClick={() => ligar(t)} className="w-full text-left px-2 py-2 hover:bg-muted/50 rounded-md flex items-center gap-3">
                  <div className="flex-1 min-w-0"><div className="text-sm truncate"><span className="font-mono text-xs">{t.numero}</span> {t.descricao}</div><div className="text-[11px] text-muted-foreground truncate">{t.beneficiario ?? "sem beneficiário"} · vence {fmtData(t.dataVencimento)} · {STATUS[t.status]?.label ?? t.status}</div></div>
                  <div className="text-sm tabular-nums">{fmtBRL(t.valorOriginal)}</div>
                </button>
              </li>
            ))}</ul>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
