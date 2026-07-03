"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import DatePicker from "@/components/shared/DatePicker";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { formatBRL } from "@/lib/utils";
import { Building2, Plus, CalendarClock, Loader2 } from "lucide-react";

type Bem = {
  id: string;
  descricao: string;
  dataAquisicao: string;
  valorAquisicao: string | number;
  valorResidual: string | number;
  vidaUtilMeses: number;
  status: "ATIVO" | "BAIXADO";
  depreciacaoAcumulada: number;
  valorContabil: number;
  criadoPor?: string | null;
  atualizadoPor?: string | null;
};

function autoriaTitle(criadoPor?: string | null, atualizadoPor?: string | null) {
  const partes = [];
  if (criadoPor) partes.push(`Criado por ${criadoPor}`);
  if (atualizadoPor) partes.push(`Atualizado por ${atualizadoPor}`);
  return partes.length ? partes.join(" · ") : undefined;
}

function mesAtual() {
  return new Date().toISOString().slice(0, 7);
}

export default function ImobilizadoPage() {
  const [bens, setBens] = useState<Bem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/contabilidade/imobilizado")
      .then((r) => r.json())
      .then((d) => setBens(d.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalBruto = bens.reduce((s, b) => s + Number(b.valorAquisicao), 0);
  const totalDepr = bens.reduce((s, b) => s + b.depreciacaoAcumulada, 0);
  const totalLiquido = bens.reduce((s, b) => s + b.valorContabil, 0);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Imobilizado"
        subtitle="Ativo não circulante e depreciação"
        actions={
          <div className="flex items-center gap-2">
            <DepreciarDialog onDone={load} />
            <NovoBemDialog onDone={load} />
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card label="Valor de aquisição" value={formatBRL(totalBruto)} />
        <Card label="Depreciação acumulada" value={formatBRL(totalDepr)} />
        <Card label="Valor contábil líquido" value={formatBRL(totalLiquido)} />
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b border-border">
            <tr>
              <th className="px-6 py-3 font-medium">Bem</th>
              <th className="px-6 py-3 font-medium">Aquisição</th>
              <th className="px-6 py-3 font-medium text-right">Valor</th>
              <th className="px-6 py-3 font-medium text-center">Vida útil</th>
              <th className="px-6 py-3 font-medium text-right">Depreciado</th>
              <th className="px-6 py-3 font-medium text-right">Valor contábil</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
            ) : bens.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-muted-foreground">Nenhum bem cadastrado.</td></tr>
            ) : bens.map((b) => (
              <tr key={b.id} title={autoriaTitle(b.criadoPor, b.atualizadoPor)} className={`border-b border-gray-50 hover:bg-muted ${b.status !== "ATIVO" ? "opacity-50" : ""}`}>
                <td className="px-6 py-3 font-medium text-foreground">{b.descricao}</td>
                <td className="px-6 py-3 text-muted-foreground">{new Date(b.dataAquisicao).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td>
                <td className="px-6 py-3 text-right tabular-nums">{formatBRL(Number(b.valorAquisicao))}</td>
                <td className="px-6 py-3 text-center text-muted-foreground">{b.vidaUtilMeses} m</td>
                <td className="px-6 py-3 text-right tabular-nums text-muted-foreground">{formatBRL(b.depreciacaoAcumulada)}</td>
                <td className="px-6 py-3 text-right tabular-nums font-semibold">{formatBRL(b.valorContabil)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold text-foreground tabular-nums mt-1">{value}</p>
    </div>
  );
}

function NovoBemDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [dataAquisicao, setDataAquisicao] = useState(new Date().toISOString().slice(0, 10));
  const [valorAquisicao, setValorAquisicao] = useState("");
  const [valorResidual, setValorResidual] = useState("0");
  const [vidaUtilMeses, setVidaUtilMeses] = useState("");
  const [deprecia, setDeprecia] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const valido = descricao.trim() && Number(valorAquisicao) > 0 && (!deprecia || parseInt(vidaUtilMeses, 10) > 0);

  async function salvar() {
    setSaving(true); setErro(null);
    const res = await fetch("/api/contabilidade/imobilizado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ descricao, dataAquisicao, valorAquisicao, valorResidual, deprecia, vidaUtilMeses: deprecia ? vidaUtilMeses : 0 }),
    });
    setSaving(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setErro(d.error ?? "Erro ao salvar"); return; }
    setOpen(false);
    setDescricao(""); setValorAquisicao(""); setValorResidual("0"); setVidaUtilMeses(""); setDeprecia(true);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="w-4 h-4 mr-1.5" /> Novo bem
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle><Building2 className="w-4 h-4 inline mr-1.5" />Novo bem do imobilizado</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Descrição</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Forno túnel, Caminhão Mercedes…" />
          </div>
          <div>
            <Label>Tipo</Label>
            <select value={deprecia ? "movel" : "terreno"} onChange={(e) => setDeprecia(e.target.value === "movel")} className="w-full h-10 rounded-lg border border-border px-3 text-sm bg-card">
              <option value="movel">Bem depreciável (veículo, máquina, equipamento)</option>
              <option value="terreno">Terreno / não depreciável</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data de aquisição</Label>
              <DatePicker value={dataAquisicao} onChange={(v) => setDataAquisicao(v)} className="w-full" />
            </div>
            <div>
              <Label>Vida útil (meses)</Label>
              <Input type="number" min={1} value={vidaUtilMeses} onChange={(e) => setVidaUtilMeses(e.target.value)} placeholder="Ex: 120" disabled={!deprecia} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor de aquisição</Label>
              <Input type="number" min={0} step="0.01" value={valorAquisicao} onChange={(e) => setValorAquisicao(e.target.value)} />
            </div>
            <div>
              <Label>Valor residual</Label>
              <Input type="number" min={0} step="0.01" value={valorResidual} onChange={(e) => setValorResidual(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Depreciação linear: (valor − residual) ÷ vida útil, por mês.</p>
          {erro && <p className="text-sm text-danger">{erro}</p>}
        </div>
        <DialogFooter>
          <Button onClick={salvar} disabled={saving || !valido}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DepreciarDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [competencia, setCompetencia] = useState(mesAtual());
  const [running, setRunning] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  async function processar() {
    setRunning(true); setResultado(null);
    const res = await fetch(`/api/contabilidade/imobilizado/depreciar?competencia=${competencia}`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setRunning(false);
    if (!res.ok) { setResultado(d.error ?? "Erro ao processar"); return; }
    setResultado(`${d.processados} bem(ns) depreciados — total ${formatBRL(d.total ?? 0)}`);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <CalendarClock className="w-4 h-4 mr-1.5" /> Processar depreciação
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Processar depreciação do mês</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Competência</Label>
            <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">Lança a depreciação linear do mês para todos os bens ativos. Rodar o mesmo mês duas vezes não duplica.</p>
          {resultado && <p className="text-sm text-foreground">{resultado}</p>}
        </div>
        <DialogFooter>
          <Button onClick={processar} disabled={running}>{running ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" />Processando…</> : "Processar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
