"use client";

// Médicos examinadores (PCMSO/ASO): cadastro usado no "Lançar ASO", que puxa
// nome e CRM daqui. Excluir só sem ASO lançado; com histórico, inativa.
import { useMemo, useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import { Pencil, Plus, Power, Search, Trash2 } from "lucide-react";
import { AcoesLinha } from "@/components/sst/comum";
import { MedicoDialog, crmCompleto, useMedicos, type Medico } from "@/components/sst/MedicoSelect";

export default function SstMedicosPage() {
  useTabTitle("SST — Médicos examinadores");
  const { medicos, recarregar } = useMedicos(true);
  const [busca, setBusca] = usePersistedState("sst:medicos:busca", "");
  const [fAtivo, setFAtivo] = usePersistedState("sst:medicos:ativo", "ativos");
  const [dlg, setDlg] = useState<{ medico: Medico | null } | null>(null);
  const [del, setDel] = useState<Medico | null>(null);
  const [salvando, setSalvando] = useState(false);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return medicos.filter((m) =>
      (fAtivo === "todos" || (fAtivo === "ativos") === m.ativo) &&
      (!q || m.nome.toLowerCase().includes(q) || m.crm.toLowerCase().includes(q) || (m.especialidade ?? "").toLowerCase().includes(q)));
  }, [medicos, busca, fAtivo]);

  async function alternar(m: Medico) {
    await fetch(`/api/sst/medicos/${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo: !m.ativo }) });
    recarregar();
  }
  async function excluir() {
    if (!del) return;
    setSalvando(true);
    await fetch(`/api/sst/medicos/${del.id}`, { method: "DELETE" });
    setSalvando(false); setDel(null); recarregar();
  }

  return (
    <div>
      <PageHeader title="Médicos examinadores" subtitle="Cadastro usado no lançamento de ASO — o CRM é preenchido automaticamente" breadcrumbs={[{ label: "SST", href: "/sst" }, { label: "Médicos examinadores" }]}
        action={<Button onClick={() => setDlg({ medico: null })} className="bg-blue-600 hover:bg-blue-700 gap-1.5"><Plus className="w-4 h-4" /> Novo médico</Button>} />
      <div className="px-8 pb-8 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative"><Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, CRM ou especialidade…" className="pl-8 h-8 w-72 text-sm" /></div>
          <SelectMenu value={fAtivo} onChange={setFAtivo} className="w-32" triggerClassName="h-8 text-xs" options={[{ value: "ativos", label: "Ativos" }, { value: "inativos", label: "Inativos" }, { value: "todos", label: "Todos" }]} />
          <span className="ml-auto text-xs text-muted-foreground">{lista.length} de {medicos.length} médico(s)</span>
        </div>
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs text-muted-foreground"><tr>
              <th className="text-left px-4 py-2 font-semibold">Médico</th>
              <th className="text-left px-3 py-2 font-semibold">CRM</th>
              <th className="text-left px-3 py-2 font-semibold">Especialidade</th>
              <th className="text-right px-3 py-2 font-semibold">ASOs lançados</th>
              <th className="px-3 py-2"></th>
            </tr></thead>
            <tbody>
              {lista.map((m) => {
                const usados = m._count?.asos ?? 0;
                return (
                  <tr key={m.id} className={cn("border-t border-border/60 hover:bg-muted/30", !m.ativo && "opacity-50")}>
                    <td className="px-4 py-2 text-foreground">{m.nome}{!m.ativo && <span className="text-xs text-danger"> · inativo</span>}</td>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">{crmCompleto(m)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{m.especialidade ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{usados}</td>
                    <td className="px-3 py-2 text-right">
                      <AcoesLinha acoes={[
                        { label: "Editar", icon: <Pencil className="w-4 h-4 mr-2" />, onClick: () => setDlg({ medico: m }) },
                        { label: m.ativo ? "Inativar" : "Reativar", icon: <Power className="w-4 h-4 mr-2" />, onClick: () => alternar(m) },
                        ...(usados === 0 ? [{ label: "Excluir", icon: <Trash2 className="w-4 h-4 mr-2" />, onClick: () => setDel(m), danger: true, separadorAntes: true }] : []),
                      ]} />
                    </td>
                  </tr>
                );
              })}
              {lista.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">{medicos.length ? "Nenhum médico com esse filtro." : "Nenhum médico cadastrado. Cadastre aqui ou direto no “Lançar ASO”."}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <MedicoDialog open={!!dlg} onOpenChange={(o) => { if (!o) setDlg(null); }} medico={dlg?.medico ?? null} onSaved={() => recarregar()} />
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Excluir médico?" description={del?.nome ?? ""} onConfirm={excluir} loading={salvando} confirmLabel="Excluir" />
    </div>
  );
}
