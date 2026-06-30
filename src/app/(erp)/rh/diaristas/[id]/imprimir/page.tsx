"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Item = { servico: string | null; valor: string; colaborador: { nome: string } | null };
type Grupo = { tipo: string; setor: string | null; turno: string; itens: Item[] };
type Folha = { data: string; observacoes: string | null; grupos: Grupo[] };

const brl = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v: string) => { const n = parseFloat(String(v)); return Number.isFinite(n) ? n : 0; };

export default function ImprimirDiarias() {
  const { id } = useParams<{ id: string }>();
  const [folha, setFolha] = useState<Folha | null>(null);

  useEffect(() => {
    fetch(`/api/rh/diaristas/${id}`).then((r) => r.json()).then((j) => setFolha(j.data)).catch(() => {});
  }, [id]);

  useEffect(() => { if (folha) setTimeout(() => window.print(), 400); }, [folha]);

  if (!folha) return <div className="p-8 text-sm text-gray-500">Carregando…</div>;

  const dataExt = new Date(`${folha.data.slice(0, 10)}T12:00:00`)
    .toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).toUpperCase();
  const tituloBloco = (g: Grupo) => `DIARIAS ${g.tipo === "FIXOS" ? "FIXOS" : "DIVERSAS"} ${g.setor || "SETORES FABRICA"} - ${g.turno === "NOITE" ? "NOITE" : "DIA"}`;

  let totalGeral = 0, totalPessoas = 0;
  for (const g of folha.grupos) for (const it of g.itens) { totalGeral += num(it.valor); totalPessoas++; }

  return (
    <div className="bg-white text-black mx-auto" style={{ width: "190mm", padding: "8mm", fontFamily: "Arial, sans-serif", fontSize: 11 }}>
      <style>{`@media print { @page { size: A4; margin: 8mm; } .noprint { display: none; } } table { border-collapse: collapse; width: 100%; } td, th { border: 1px solid #000; padding: 2px 6px; }`}</style>

      <div className="noprint mb-3 text-right">
        <button onClick={() => window.print()} className="border border-gray-400 rounded px-3 py-1 text-sm">Imprimir / Salvar PDF</button>
      </div>

      {folha.grupos.map((g, gi) => {
        const subtotal = g.itens.reduce((a, it) => a + num(it.valor), 0);
        return (
          <table key={gi} style={{ marginBottom: 10 }}>
            <thead>
              <tr><th colSpan={4} style={{ background: "#d9d9d9", textAlign: "center", fontWeight: "bold" }}>{dataExt}</th></tr>
              <tr><th colSpan={4} style={{ background: "#d9d9d9", textAlign: "center", fontWeight: "bold" }}>{tituloBloco(g)}</th></tr>
              <tr style={{ background: "#f0f0f0", fontWeight: "bold" }}>
                <th style={{ width: "8%" }}>N</th><th style={{ width: "37%" }}>NOME</th><th style={{ width: "40%" }}>SERVIÇOS</th><th style={{ width: "15%" }}>VALOR</th>
              </tr>
            </thead>
            <tbody>
              {g.itens.map((it, i) => (
                <tr key={i}>
                  <td style={{ textAlign: "center" }}>{i + 1}</td>
                  <td style={{ textTransform: "uppercase" }}>{it.colaborador?.nome ?? "—"}</td>
                  <td>{it.servico ?? ""}</td>
                  <td style={{ textAlign: "right" }}>{brl(num(it.valor))}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: "bold" }}>
                <td colSpan={3} style={{ textAlign: "center" }}>TOTAL</td>
                <td style={{ textAlign: "right" }}>{brl(subtotal)}</td>
              </tr>
            </tbody>
          </table>
        );
      })}

      <table>
        <tbody>
          <tr style={{ fontWeight: "bold" }}>
            <td style={{ textAlign: "center" }}>TOTAL GERAL - {totalPessoas}</td>
            <td style={{ textAlign: "right", width: "15%" }}>{brl(totalGeral)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
