"use client";

// Bens do imobilizado ligados ao processo (fase 2) — ex.: regularização fundiária ↔ terreno.
// Mostrado na aba Partes da ficha; a lista de bens do Imobilizado mostra o processo de volta.
import { useEffect, useState } from "react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Building2, Trash2 } from "lucide-react";
import { api, fmtData } from "@/components/processos/comum";

export type BemLigado = { id: string; observacao: string | null; imobilizado: { id: string; descricao: string; status: string; dataAquisicao: string } };

export default function BensProcesso({ processoId, bens, pode, onMudou }: { processoId: string; bens: BemLigado[]; pode: boolean; onMudou: () => void }) {
  const [opcoes, setOpcoes] = useState<{ id: string; descricao: string; status: string }[]>([]);
  const [sel, setSel] = useState("");
  const [erro, setErro] = useState("");
  useEffect(() => {
    if (!pode) return;
    fetch(`/api/processos/${processoId}/bens`).then((r) => r.json()).then((j) => setOpcoes(j.data ?? [])).catch(() => {});
  }, [processoId, pode]);
  const ligados = new Set(bens.map((b) => b.imobilizado.id));

  async function ligar(id: string) {
    if (!id) return;
    setErro("");
    const r = await api(`/api/processos/${processoId}/bens`, "POST", { imobilizadoId: id });
    setSel("");
    if (!r.ok) { setErro(r.error ?? "Erro."); return; }
    onMudou();
  }
  async function desligar(b: BemLigado) {
    if (!confirm(`Desligar "${b.imobilizado.descricao}" do processo?`)) return;
    await api(`/api/processos/${processoId}/bens?vinculoId=${b.id}`, "DELETE");
    onMudou();
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bens do imobilizado</div>
      {pode && <div className="w-full sm:w-96"><ComboboxWithCreate value={sel} onChange={(v) => { setSel(v); ligar(v); }} allowNone={false} placeholder="Ligar bem do imobilizado (imóvel, terreno…)" menuMinWidth={420}
        options={opcoes.filter((o) => !ligados.has(o.id)).map((o) => ({ value: o.id, label: o.descricao, code: o.status === "BAIXADO" ? "baixado" : undefined }))} /></div>}
      {erro && <p className="text-sm text-danger">{erro}</p>}
      {bens.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum bem ligado.</p> : (
        <ul className="divide-y divide-border/60">
          {bens.map((b) => (
            <li key={b.id} className="py-2 flex items-center gap-3">
              <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0"><div className="text-sm">{b.imobilizado.descricao}</div><div className="text-[11px] text-muted-foreground">adquirido em {fmtData(b.imobilizado.dataAquisicao)}{b.imobilizado.status === "BAIXADO" && " · baixado"}{b.observacao && ` · ${b.observacao}`}</div></div>
              {pode && <button onClick={() => desligar(b)} className="text-muted-foreground hover:text-danger" title="Desligar"><Trash2 className="w-3.5 h-3.5" /></button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
