"use client";

// Pré-eSocial: exporta os dados dos eventos S-2210 (CAT) e S-2220 (ASO) para o
// contador/provedor transmitir. Mostra o que está incompleto antes de exportar.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import { Button } from "@/components/ui/button";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { Loader2, Download } from "lucide-react";

type Linha = Record<string, string | number>;
type Dados = { evento: string; ano: number; empresa: { razaoSocial: string; cnpj: string | null } | null; total: number; linhas: Linha[] };

export default function SstEsocialPage() {
  useTabTitle("SST — Pré-eSocial");
  const [evento, setEvento] = useState("S2210");
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [d, setD] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); const j = await fetch(`/api/sst/esocial?evento=${evento}&ano=${ano}`).then((r) => r.json()).catch(() => null); setD(j?.data ?? null); setLoading(false); }, [evento, ano]);
  useEffect(() => { load(); }, [load]);
  const anos = Array.from({ length: 4 }, (_, i) => String(new Date().getFullYear() - i));
  const cols = d && d.linhas[0] ? Object.keys(d.linhas[0]) : [];
  const semCpf = d ? d.linhas.filter((l) => !l.cpfTrabalhador).length : 0;
  const semCat = d && d.evento === "S2210" ? d.linhas.filter((l) => l.pendente).length : 0;

  return (
    <div>
      <PageHeader title="Pré-eSocial" subtitle="Dados dos eventos de SST prontos para o contador/provedor transmitir (S-2210 CAT · S-2220 ASO)" breadcrumbs={[{ label: "SST", href: "/sst" }, { label: "Pré-eSocial" }]}
        action={<div className="flex items-center gap-2">
          <SelectMenu value={evento} onChange={setEvento} className="w-56" options={[{ value: "S2210", label: "S-2210 — CAT" }, { value: "S2220", label: "S-2220 — ASO / monitoramento" }]} />
          <SelectMenu value={ano} onChange={setAno} className="w-28" options={anos.map((a) => ({ value: a, label: a }))} />
          <a href={`/api/sst/esocial?evento=${evento}&ano=${ano}&formato=csv`}><Button size="sm" variant="outline" className="gap-1.5"><Download className="w-3.5 h-3.5" /> CSV</Button></a>
          <a href={`/api/sst/esocial?evento=${evento}&ano=${ano}`} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">JSON</Button></a>
        </div>} />
      <div className="px-8 pb-8 space-y-4">
        <div className="bg-info/5 border border-info/30 rounded-xl px-4 py-3 text-sm text-foreground">
          <p>O ERP <strong>não transmite</strong> ao eSocial: a transmissão exige certificado digital A1 da empresa e assinatura dos XMLs. Esta tela entrega os dados já no vocabulário dos eventos para quem transmite (contador ou um provedor de API). O S-2240 (agentes nocivos) depende do inventário de riscos por GHE, que ainda não foi cadastrado.</p>
          {d?.empresa && <p className="text-xs text-muted-foreground mt-1">{d.empresa.razaoSocial}{d.empresa.cnpj ? ` · CNPJ ${d.empresa.cnpj}` : " · CNPJ não cadastrado"}</p>}
        </div>
        {(semCpf > 0 || semCat > 0) && (
          <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-sm text-danger">
            {semCpf > 0 && <p>{semCpf} registro(s) sem CPF do trabalhador — o eSocial rejeita; complete em <Link href="/empresa/colaboradores" className="underline">Colaboradores</Link>.</p>}
            {semCat > 0 && <p>{semCat} acidente(s) sem número de CAT — emita a CAT (<Link href="/sst/incidentes" className="underline">Incidentes</Link>) antes de enviar o S-2210.</p>}
          </div>
        )}
        {loading || !d ? <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : d.linhas.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">Nenhum registro em {ano} para este evento.</p> : (
          <div className="bg-card rounded-xl border border-border overflow-x-auto">
            <table className="text-xs whitespace-nowrap">
              <thead className="bg-muted text-muted-foreground"><tr>{cols.map((c) => <th key={c} className="text-left px-3 py-2 font-semibold">{c}</th>)}</tr></thead>
              <tbody>{d.linhas.map((l, i) => <tr key={i} className={cn("border-t border-border/60", (l.pendente || !l.cpfTrabalhador) && "bg-danger/5")}>{cols.map((c) => <td key={c} className={cn("px-3 py-1.5 max-w-xs truncate", c === "pendente" && l[c] ? "text-danger font-medium" : "text-foreground")} title={String(l[c] ?? "")}>{String(l[c] ?? "")}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
