"use client";

import { Fragment, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTabTitle } from "@/lib/tabs-context";

type Item = { servico: string | null; manha: string | null; tarde: string | null; horasExcedente: string | null; valor: string; valorTotal?: string; colaborador: { nome: string } | null };
type Grupo = { tipo: string; setor: string | null; turno: string; itens: Item[] };
type Folha = { data: string; turno?: string; observacoes: string | null; grupos: Grupo[] };

const brl = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v: string) => { const n = parseFloat(String(v)); return Number.isFinite(n) ? n : 0; };
// Valor impresso = total (diária + excedente); folhas antigas caem no valor base.
const valorItem = (it: Item) => { const t = num(it.valorTotal ?? "0"); return t > 0 ? t : num(it.valor); };

// Planilha de assinatura dos diaristas (A4 paisagem): cada um confere o valor,
// preenche os horários e assina; o escaneado volta pelo botão de upload da folha.
export default function ImprimirDiarias() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useTabTitle("Imprimir Diárias");
  const [folha, setFolha] = useState<Folha | null>(null);
  // Impressão agrupada por setor (um quadro por bloco) ou corrida (tudo junto).
  const [agruparPorSetor, setAgruparPorSetor] = useState(true);

  useEffect(() => {
    fetch(`/api/rh/diaristas/${id}`).then((r) => r.json()).then((j) => setFolha(j.data)).catch(() => {});
  }, [id]);

  useEffect(() => { if (folha) setTimeout(() => window.print(), 400); }, [folha]);

  if (!folha) return <div className="p-8 text-sm text-gray-500">Carregando…</div>;

  const d = new Date(`${folha.data.slice(0, 10)}T12:00:00`);
  const dataExt = `${d.toLocaleDateString("pt-BR")} - ${d.toLocaleDateString("pt-BR", { weekday: "long" }).toUpperCase()}`;

  let totalGeral = 0, totalPessoas = 0;
  for (const g of folha.grupos) for (const it of g.itens) { totalGeral += valorItem(it); totalPessoas++; }

  const azul = { background: "#c5d9f1", fontWeight: "bold" as const, textAlign: "center" as const };

  // Cabeçalho de colunas repetido a cada bloco; a coluna Setor/Serviço leva o
  // nome do SETOR do bloco (os blocos são por setor).
  const headerBloco = (g: Grupo) => {
    const noite = g.turno === "NOITE";
    return (
      <tr>
        <th style={{ ...azul, width: "3%" }}>N</th>
        <th style={{ ...azul, width: "21%" }}>NOME</th>
        <th style={{ ...azul, width: "10%" }}>MANHÃ<br />{noite ? "—" : "08:00 - 12:00"}</th>
        <th style={{ ...azul, width: "10%" }}>TARDE<br />{noite ? "—" : "13:00 - 17:00"}</th>
        <th style={{ ...azul, width: "8%" }}>Q. HORAS<br />EXCEDENTE</th>
        <th style={{ ...azul, width: "20%" }}>{(g.setor || "SETOR/SERVIÇO").toUpperCase()}{noite ? " - NOITE" : ""}</th>
        <th style={{ ...azul, width: "9%" }}>VALOR</th>
        <th style={{ ...azul, width: "19%" }}>ASSINATURA</th>
      </tr>
    );
  };

  return (
    <div className="bg-white text-black mx-auto" style={{ width: "277mm", padding: "6mm", fontFamily: "Arial, sans-serif", fontSize: 10 }}>
      <style>{`@media print { @page { size: A4 landscape; margin: 6mm; } .noprint { display: none; } } table { border-collapse: collapse; width: 100%; } td, th { border: 1px solid #000; padding: 2px 5px; }`}</style>

      <div className="noprint mb-3 flex items-center justify-end gap-3">
        <label className="flex items-center gap-1.5 text-sm cursor-pointer">
          <input type="checkbox" checked={agruparPorSetor} onChange={(e) => setAgruparPorSetor(e.target.checked)} />
          Agrupar por setor
        </label>
        <button onClick={() => router.push(`/rh/diaristas/${id}`)} className="border border-gray-400 rounded px-3 py-1 text-sm">Voltar</button>
        <button onClick={() => window.print()} className="border border-gray-400 rounded px-3 py-1 text-sm">Imprimir / Salvar PDF</button>
      </div>

      <table>
        <thead>
          <tr><th colSpan={8} style={{ textAlign: "center", fontWeight: "bold" }}>DIÁRIAS ({folha.turno === "NOITE" ? "NOITE" : "DIA"}) - {dataExt}</th></tr>
        </thead>
        <tbody>
          {agruparPorSetor ? (
            folha.grupos.map((g, gi) => (
              <Fragment key={gi}>
                {headerBloco(g)}
                {g.itens.map((it, i) => (
                  <tr key={`${gi}-${i}`} style={{ height: 22 }}>
                    <td style={{ textAlign: "center" }}>{i + 1}</td>
                    <td style={{ textTransform: "uppercase", fontWeight: "bold" }}>{it.colaborador?.nome ?? ""}</td>
                    <td style={{ textAlign: "center", textTransform: "uppercase" }}>{it.manha ?? ""}</td>
                    <td style={{ textAlign: "center", textTransform: "uppercase" }}>{it.tarde ?? ""}</td>
                    <td style={{ textAlign: "center", textTransform: "uppercase" }}>{it.horasExcedente ?? ""}</td>
                    <td style={{ textAlign: "center", textTransform: "uppercase" }}>{it.servico ?? ""}</td>
                    <td style={{ textAlign: "right" }}>{valorItem(it) > 0 ? brl(valorItem(it)) : ""}</td>
                    <td />
                  </tr>
                ))}
              </Fragment>
            ))
          ) : (
            <Fragment>
              {headerBloco({ tipo: "", setor: null, turno: folha.turno ?? "DIA", itens: [] })}
              {folha.grupos.flatMap((g) => g.itens.map((it) => ({ g, it }))).map(({ g, it }, i) => (
                <tr key={i} style={{ height: 22 }}>
                  <td style={{ textAlign: "center" }}>{i + 1}</td>
                  <td style={{ textTransform: "uppercase", fontWeight: "bold" }}>{it.colaborador?.nome ?? ""}</td>
                  <td style={{ textAlign: "center", textTransform: "uppercase" }}>{it.manha ?? ""}</td>
                  <td style={{ textAlign: "center", textTransform: "uppercase" }}>{it.tarde ?? ""}</td>
                  <td style={{ textAlign: "center", textTransform: "uppercase" }}>{it.horasExcedente ?? ""}</td>
                  <td style={{ textAlign: "center", textTransform: "uppercase" }}>{it.servico || g.setor || ""}</td>
                  <td style={{ textAlign: "right" }}>{valorItem(it) > 0 ? brl(valorItem(it)) : ""}</td>
                  <td />
                </tr>
              ))}
            </Fragment>
          )}
          <tr style={{ fontWeight: "bold" }}>
            <td colSpan={6} style={{ textAlign: "right" }}>TOTAL GERAL — {totalPessoas} PESSOA{totalPessoas !== 1 ? "S" : ""}</td>
            <td style={{ textAlign: "right" }}>{brl(totalGeral)}</td>
            <td />
          </tr>
        </tbody>
      </table>

      {folha.observacoes && <p style={{ marginTop: 8, fontSize: 10 }}>OBS.: {folha.observacoes}</p>}
    </div>
  );
}
