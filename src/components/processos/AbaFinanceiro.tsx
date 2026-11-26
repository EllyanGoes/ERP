"use client";

// Aba "Financeiro" da ficha do processo (fase 2 + §8.3): títulos a pagar (custas, taxas,
// honorários, multas) e a receber (restituição, indenização) ligados ao processo, e os DEPÓSITOS
// JUDICIAIS / garantias com saldo e destino (levantado → título a receber; convertido em
// pagamento → reclassificação contábil D despesa / C Depósitos Judiciais).
// "Novo lançamento" reaproveita o formulário do Contas a Pagar/Receber (LancamentoForm) já com
// o processo vinculado; "Depósito judicial" é o mesmo formulário com a natureza travada
// pré-selecionada; "Vincular título" liga um título existente da mesma empresa.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CreateDrawer from "@/components/shared/CreateDrawer";
import DatePicker from "@/components/shared/DatePicker";
import LancamentoForm from "@/components/financeiro/LancamentoForm";
import NaturezaCombobox, { type NaturezaOpt } from "@/components/financeiro/NaturezaCombobox";
import { fmtCampoBR } from "@/components/financeiro/PagamentoTituloForm";
import { parseValorBR } from "@/components/pedidos-venda/PagamentosInput";
import { cn } from "@/lib/utils";
import { ArrowDownLeft, ArrowUpRight, Landmark, Link2, Loader2, Plus, ShieldAlert, Undo2, X } from "lucide-react";
import { api, fmtBRL, fmtData } from "@/components/processos/comum";

type Titulo = {
  id: string; numero: string; descricao: string; valorOriginal: string; valorPago: string; status: string; deposito?: boolean;
  dataVencimento: string | null; dataPagamento: string | null; beneficiario: string | null; naturezaFinanceira: { codigo: string | null; nome: string } | null;
};
type Destino = {
  id: string; tipo: "LEVANTADO" | "CONVERTIDO"; valor: string; data: string; observacao: string | null; criadoPor: string | null;
  naturezaFinanceira: { codigo: string | null; nome: string } | null; contaReceber: { id: string; numero: string; status: string; valorPago: string } | null;
};
type Deposito = { id: string; numero: string; descricao: string; status: string; dataPagamento: string | null; depositado: number; destinado: number; saldo: number; destinos: Destino[] };
type Resp = {
  podeVer: boolean; podeEditar: boolean; pagar: Titulo[]; receber: Titulo[]; depositos: Deposito[];
  totais: { pagarPago: number; pagarAberto: number; receberRecebido: number; receberAberto: number; depositadoSaldo: number } | null;
};
type Tipo = "pagar" | "receber";
type Novo = Tipo | "deposito";

const STATUS: Record<string, { label: string; cls: string }> = {
  ABERTA: { label: "Em aberto", cls: "bg-warning/10 text-warning border-warning/30" },
  PARCIAL: { label: "Parcial", cls: "bg-info/10 text-info border-info/30" },
  PAGA: { label: "Quitado", cls: "bg-success/10 text-success border-success/30" },
};

export default function AbaFinanceiro({ processo, onContagem }: { processo: { id: string; codigo: string }; onContagem?: (n: number) => void }) {
  const [r, setR] = useState<Resp | null>(null);
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState<Novo | null>(null);
  const [destino, setDestino] = useState<Deposito | null>(null);
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

  async function desfazerDestino(d: Destino) {
    const txt = d.tipo === "CONVERTIDO" ? "Desfazer a conversão? O lançamento contábil da conversão é apagado." : `Desfazer o levantamento? O título ${d.contaReceber?.numero ?? ""} a receber é excluído (só se ainda não foi recebido).`;
    if (!confirm(txt)) return;
    const res = await api(`/api/processos/${processo.id}/depositos?destinoId=${d.id}`, "DELETE");
    if (!res.ok) setErro(res.error ?? "Erro."); else setErro("");
    load();
  }

  const t = r.totais!;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Card label="Pago (custas, honorários…)" valor={t.pagarPago} />
        <Card label="A pagar em aberto" valor={t.pagarAberto} destaque={t.pagarAberto > 0 ? "warning" : undefined} />
        <Card label="Depositado em juízo (saldo)" valor={t.depositadoSaldo} />
        <Card label="Recebido" valor={t.receberRecebido} />
        <Card label="A receber em aberto" valor={t.receberAberto} />
      </div>
      {erro && <p className="text-sm text-danger">{erro}</p>}
      <Bloco titulo="A pagar" icone={<ArrowDownLeft className="w-4 h-4 text-danger" />} tipo="pagar" lista={r.pagar} pode={r.podeEditar} onNovo={() => setNovo("pagar")} onVincular={() => setVincular("pagar")} onDesvincular={desvincular}
        onDeposito={() => setNovo("deposito")}
        vazio="Nenhum título a pagar. Lance aqui custas, taxas (DAE, emolumentos), honorários, multas e depósitos judiciais." />
      {r.depositos.length > 0 && <Depositos lista={r.depositos} pode={r.podeEditar} onDestinar={setDestino} onDesfazer={desfazerDestino} />}
      <Bloco titulo="A receber" icone={<ArrowUpRight className="w-4 h-4 text-success" />} tipo="receber" lista={r.receber} pode={r.podeEditar} onNovo={() => setNovo("receber")} onVincular={() => setVincular("receber")} onDesvincular={desvincular}
        vazio="Nenhum título a receber (restituição, indenização, levantamento de depósito)." />
      <p className="text-[11px] text-muted-foreground">O vínculo com o processo é gerencial: a contabilização do título segue a natureza financeira, como em qualquer lançamento. Depósito judicial/garantia (natureza travada) é ATIVO — não entra em despesa nem em “Pago”; sai do saldo quando levantado ou convertido em pagamento.</p>

      <CreateDrawer open={!!novo} onOpenChange={(o) => !o && setNovo(null)} title={novo === "receber" ? `Novo a receber — ${processo.codigo}` : novo === "deposito" ? `Depósito judicial / garantia — ${processo.codigo}` : `Novo a pagar — ${processo.codigo}`} width="lg" onCreated={load}>
        {novo === "deposito"
          ? <LancamentoForm tipo="pagar" processo={processo} naturezaChaveInicial="deposito-judicial" descricaoInicial={`Depósito judicial — ${processo.codigo}`} />
          : novo && <LancamentoForm tipo={novo} processo={processo} />}
      </CreateDrawer>
      {destino && <DestinoDialog processoId={processo.id} deposito={destino} onFechar={() => setDestino(null)} onFeito={() => { setDestino(null); load(); }} />}
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

function Bloco({ titulo, icone, tipo, lista, pode, onNovo, onVincular, onDesvincular, onDeposito, vazio }: {
  titulo: string; icone: React.ReactNode; tipo: Tipo; lista: Titulo[]; pode: boolean; vazio: string;
  onNovo: () => void; onVincular: () => void; onDesvincular: (tipo: Tipo, t: Titulo) => void; onDeposito?: () => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-x-auto">
      <div className="px-4 py-2.5 flex flex-wrap items-center gap-2 border-b border-border">
        <span className="text-sm font-semibold inline-flex items-center gap-1.5">{icone} {titulo}</span>
        {pode && <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={onVincular}><Link2 className="w-3.5 h-3.5" /> Vincular título existente</Button>
          {onDeposito && <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={onDeposito} title="Depósito recursal, judicial ou garantia do juízo: vai para o ATIVO (Depósitos Judiciais), não para despesa"><Landmark className="w-3.5 h-3.5" /> Depósito judicial / garantia</Button>}
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
                <td className="px-4 py-2"><a href={`/contas-${tipo === "pagar" ? "pagar" : "receber"}?abrir=${t.id}`} className="font-mono text-xs hover:underline">{t.numero}</a> {t.descricao}
                  {t.deposito && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full border border-info/30 bg-info/10 text-info">depósito</span>}
                  {t.naturezaFinanceira && <div className="text-[11px] text-muted-foreground">{t.naturezaFinanceira.codigo ? `${t.naturezaFinanceira.codigo} ` : ""}{t.naturezaFinanceira.nome}</div>}</td>
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

// ── Depósitos judiciais: saldo por depósito e destinos ─────────────────────────
function Depositos({ lista, pode, onDestinar, onDesfazer }: { lista: Deposito[]; pode: boolean; onDestinar: (d: Deposito) => void; onDesfazer: (d: Destino) => void }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-x-auto">
      <div className="px-4 py-2.5 flex items-center gap-2 border-b border-border">
        <span className="text-sm font-semibold inline-flex items-center gap-1.5"><Landmark className="w-4 h-4 text-info" /> Depósitos judiciais / garantias</span>
        <span className="ml-auto text-xs text-muted-foreground">Saldo em juízo: <b className="text-foreground tabular-nums">{fmtBRL(lista.reduce((s, d) => s + d.saldo, 0))}</b></span>
      </div>
      <ul className="divide-y divide-border/60">
        {lista.map((d) => (
          <li key={d.id} className="px-4 py-2.5 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span><span className="font-mono text-xs">{d.numero}</span> {d.descricao}</span>
              <span className="text-xs text-muted-foreground">{d.depositado > 0 ? `depositado ${fmtBRL(d.depositado)}${d.dataPagamento ? ` em ${fmtData(d.dataPagamento)}` : ""}` : "ainda não pago"}</span>
              <span className="text-xs">saldo <b className="tabular-nums">{fmtBRL(d.saldo)}</b></span>
              {pode && d.saldo > 0.005 && <Button size="sm" variant="outline" className="ml-auto h-7 gap-1.5" onClick={() => onDestinar(d)}>Destinar</Button>}
            </div>
            {d.destinos.length > 0 && (
              <ul className="pl-3 border-l-2 border-border space-y-1">
                {d.destinos.map((x) => (
                  <li key={x.id} className="text-xs flex items-center gap-2">
                    <span className={cn("px-1.5 py-0.5 rounded-full border text-[10px]", x.tipo === "LEVANTADO" ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning")}>{x.tipo === "LEVANTADO" ? "Levantado" : "Convertido em pagamento"}</span>
                    <span className="tabular-nums">{fmtBRL(x.valor)}</span>
                    <span className="text-muted-foreground">{fmtData(x.data)}</span>
                    {x.tipo === "LEVANTADO" && x.contaReceber && <a href={`/contas-receber?abrir=${x.contaReceber.id}`} className="font-mono hover:underline">{x.contaReceber.numero}{x.contaReceber.status === "PAGA" ? " · recebido" : x.contaReceber.status === "CANCELADA" ? " · cancelado" : " · a receber"}</a>}
                    {x.tipo === "CONVERTIDO" && x.naturezaFinanceira && <span className="text-muted-foreground">{x.naturezaFinanceira.codigo ? `${x.naturezaFinanceira.codigo} ` : ""}{x.naturezaFinanceira.nome}</span>}
                    {x.observacao && <span className="text-muted-foreground truncate">· {x.observacao}</span>}
                    {pode && <button onClick={() => onDesfazer(x)} className="ml-auto text-muted-foreground hover:text-danger" title="Desfazer este destino"><Undo2 className="w-3.5 h-3.5" /></button>}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const hojeIso = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

function DestinoDialog({ processoId, deposito, onFechar, onFeito }: { processoId: string; deposito: Deposito; onFechar: () => void; onFeito: () => void }) {
  const [tipo, setTipo] = useState<"LEVANTADO" | "CONVERTIDO">("LEVANTADO");
  const [valor, setValor] = useState(fmtCampoBR(String(deposito.saldo).replace(".", ",")));
  const [data, setData] = useState(hojeIso());
  const [vencimento, setVencimento] = useState(hojeIso());
  const [naturezaId, setNaturezaId] = useState("");
  const [obs, setObs] = useState("");
  const [naturezas, setNaturezas] = useState<NaturezaOpt[]>([]);
  const [erro, setErro] = useState(""); const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    fetch("/api/financeiro/naturezas?tipo=SAIDA&ativo=1").then((x) => x.json()).then((j) => {
      const lista = (Array.isArray(j) ? j : (j.data ?? [])) as (NaturezaOpt & { afetaResultado?: boolean; sistemaChave?: string | null })[];
      // Conversão = despesa de fato (multa, condenação, custas…): só naturezas que afetam o resultado.
      setNaturezas(lista.filter((n) => n.afetaResultado !== false && n.sistemaChave !== "deposito-judicial"));
    }).catch(() => {});
  }, []);
  async function salvar() {
    const v = parseValorBR(valor);
    if (!(v > 0)) { setErro("Informe o valor."); return; }
    if (v > deposito.saldo + 0.005) { setErro(`O valor passa do saldo (${fmtBRL(deposito.saldo)}).`); return; }
    if (tipo === "CONVERTIDO" && !naturezaId) { setErro("Escolha a natureza da despesa."); return; }
    setSalvando(true); setErro("");
    const res = await api(`/api/processos/${processoId}/depositos`, "POST", { contaPagarId: deposito.id, tipo, valor: v, data, vencimento: tipo === "LEVANTADO" ? vencimento : null, naturezaFinanceiraId: tipo === "CONVERTIDO" ? naturezaId : null, observacao: obs });
    setSalvando(false);
    if (!res.ok) { setErro(res.error ?? "Erro."); return; }
    onFeito();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && !salvando && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Destinar depósito {deposito.numero}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Saldo em juízo: <b className="text-foreground">{fmtBRL(deposito.saldo)}</b>. Pode destinar só uma parte.</p>
          <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
            {(["LEVANTADO", "CONVERTIDO"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setTipo(k)} className={cn("px-2.5 py-1 rounded-md", tipo === k ? "bg-muted text-foreground font-medium" : "text-muted-foreground")}>
                {k === "LEVANTADO" ? "Levantado (volta para a empresa)" : "Convertido em pagamento"}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {tipo === "LEVANTADO"
              ? "Cria um título A RECEBER ligado ao processo. Quando você der baixa nele, o contábil faz D Banco / C Depósitos Judiciais (não é receita). Correção/juros recebidos a mais entram como juros na baixa."
              : "Reconhece a perda: lançamento contábil D despesa (natureza escolhida) / C Depósitos Judiciais, na data informada. Não mexe no caixa."}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Valor (R$)</Label><Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} onBlur={(e) => setValor(fmtCampoBR(e.target.value))} className="text-right font-mono" /></div>
            <div><Label>{tipo === "LEVANTADO" ? "Data do alvará / decisão" : "Data da conversão"}</Label><DatePicker value={data} onChange={(v) => setData(v ?? "")} allowClear={false} /></div>
          </div>
          {tipo === "LEVANTADO"
            ? <div className="w-1/2 pr-1.5"><Label>Previsão de recebimento</Label><DatePicker value={vencimento} onChange={(v) => setVencimento(v ?? "")} allowClear={false} /></div>
            : <div><Label>Natureza da despesa</Label><NaturezaCombobox value={naturezaId} onChange={setNaturezaId} naturezas={naturezas} placeholder="Multa, condenação, custas…" /></div>}
          <div><Label>Observação</Label><Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: alvará nº…, acordo homologado em…" /></div>
          {erro && <p className="text-sm text-danger">{erro}</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button><Button onClick={salvar} disabled={salvando}>{salvando ? "Gravando…" : "Registrar destino"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
