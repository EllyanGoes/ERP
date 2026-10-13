"use client";

// Termo de entrega de EPI (NR-06, item 6.6.1) — impressão A4 para assinatura
// do colaborador; o escaneado volta pelo botão "Anexar assinada" da ficha.
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTabTitle } from "@/lib/tabs-context";
import { fmtData, TIPO_ENTREGA } from "@/components/sst/comum";

type Ficha = {
  id: string; numero: number; data: string; observacoes: string | null; documentoId: string | null;
  empresa: { razaoSocial: string; nomeFantasia: string | null; cnpj: string };
  colaborador: { nome: string; cpf: string | null; matricula: string | null; cargo: string | null; setor: { nome: string } | null; sstFuncoes: { funcao: { nome: string } }[] };
  itens: { id: string; tipo: string; quantidade: number; motivo: string | null; vencimentoUso: string | null; epi: { nome: string; ca: string | null; vidaUtilDias: number | null } }[];
};

const fmtCpf = (v: string | null) => (v && v.replace(/\D/g, "").length === 11 ? v.replace(/\D/g, "").replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : v ?? "—");
const fmtCnpj = (v: string) => (v.replace(/\D/g, "").length === 14 ? v.replace(/\D/g, "").replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : v);

export default function FichaEpiImprimir() {
  const { id } = useParams<{ id: string }>();
  useTabTitle("Termo de EPI");
  const [f, setF] = useState<Ficha | null>(null);
  useEffect(() => { fetch(`/api/sst/entregas/fichas/${id}`).then((r) => r.json()).then((j) => setF(j.data ?? null)).catch(() => {}); }, [id]);
  if (!f) return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;

  const funcao = f.colaborador.sstFuncoes[0]?.funcao.nome ?? f.colaborador.cargo ?? "—";
  const numero = String(f.numero).padStart(4, "0");
  const cell = { border: "1px solid #000", padding: "4px 6px", fontSize: 11 } as const;

  return (
    <div className="print-area bg-white text-black mx-auto my-4" style={{ width: "190mm", padding: "8mm", fontFamily: "Arial, sans-serif", fontSize: 12 }}>
      <style>{`@media print { @page { size: A4 portrait; margin: 10mm; } }`}</style>
      <div className="no-print mb-3 flex items-center justify-end gap-3">
        <button onClick={() => window.print()} className="border border-gray-400 rounded px-3 py-1 text-sm">Imprimir / Salvar PDF</button>
      </div>

      <div style={{ borderBottom: "2px solid #000", paddingBottom: 6, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{f.empresa.nomeFantasia || f.empresa.razaoSocial}</div>
          <div style={{ fontSize: 10 }}>{f.empresa.razaoSocial} · CNPJ {fmtCnpj(f.empresa.cnpj)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>FICHA DE ENTREGA DE EPI</div>
          <div style={{ fontSize: 10 }}>Nº {numero} · NR-06 · {fmtData(f.data)}</div>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
        <tbody>
          <tr><td style={{ ...cell, width: "18%", fontWeight: 700, background: "#eee" }}>Colaborador</td><td style={cell} colSpan={3}>{f.colaborador.nome}</td></tr>
          <tr>
            <td style={{ ...cell, fontWeight: 700, background: "#eee" }}>CPF</td><td style={cell}>{fmtCpf(f.colaborador.cpf)}</td>
            <td style={{ ...cell, width: "18%", fontWeight: 700, background: "#eee" }}>Matrícula</td><td style={cell}>{f.colaborador.matricula ?? "—"}</td>
          </tr>
          <tr>
            <td style={{ ...cell, fontWeight: 700, background: "#eee" }}>Função</td><td style={cell}>{funcao}</td>
            <td style={{ ...cell, fontWeight: 700, background: "#eee" }}>Setor</td><td style={cell}>{f.colaborador.setor?.nome ?? "—"}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#eee" }}>
            <th style={{ ...cell, width: "5%" }}>#</th><th style={{ ...cell, textAlign: "left" }}>EPI</th><th style={{ ...cell, width: "12%" }}>CA</th>
            <th style={{ ...cell, width: "7%" }}>Qtd</th><th style={{ ...cell, width: "11%" }}>Tipo</th><th style={{ ...cell, width: "13%" }}>Troca prevista</th><th style={{ ...cell, width: "20%" }}>Motivo / obs.</th>
          </tr>
        </thead>
        <tbody>
          {f.itens.map((it, i) => (
            <tr key={it.id}>
              <td style={{ ...cell, textAlign: "center" }}>{i + 1}</td><td style={cell}>{it.epi.nome}</td><td style={{ ...cell, textAlign: "center" }}>{it.epi.ca ?? "—"}</td>
              <td style={{ ...cell, textAlign: "center" }}>{it.quantidade}</td><td style={{ ...cell, textAlign: "center" }}>{TIPO_ENTREGA[it.tipo] ?? it.tipo}</td>
              <td style={{ ...cell, textAlign: "center" }}>{it.vencimentoUso ? fmtData(it.vencimentoUso) : "—"}</td><td style={{ ...cell, fontSize: 10 }}>{it.motivo ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {f.observacoes && <p style={{ fontSize: 10, marginTop: 6 }}><b>Observações:</b> {f.observacoes}</p>}

      <div style={{ marginTop: 14, fontSize: 10, textAlign: "justify", lineHeight: 1.45 }}>
        <p style={{ fontWeight: 700, marginBottom: 4 }}>TERMO DE RESPONSABILIDADE</p>
        <p>Declaro que recebi gratuitamente da empresa os Equipamentos de Proteção Individual acima relacionados, em perfeito estado de conservação e funcionamento, e que fui orientado(a) quanto ao seu uso correto. Comprometo-me, nos termos da NR-06 (item 6.7) e do art. 158 da CLT, a: (a) usar o EPI apenas para a finalidade a que se destina; (b) responsabilizar-me pela guarda e conservação; (c) comunicar ao empregador qualquer alteração que o torne impróprio para uso; (d) devolvê-lo quando solicitado, na troca ou no desligamento. Estou ciente de que a recusa injustificada ao uso do EPI constitui ato faltoso, e de que, em caso de perda ou dano por mau uso comprovado, poderá haver desconto do valor correspondente, conforme art. 462, §1º da CLT.</p>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginTop: 36 }}>
        <div style={{ flex: 1, textAlign: "center", borderTop: "1px solid #000", paddingTop: 4, fontSize: 10 }}>{f.colaborador.nome}<br />Assinatura do colaborador</div>
        <div style={{ flex: 1, textAlign: "center", borderTop: "1px solid #000", paddingTop: 4, fontSize: 10 }}>Responsável pela entrega<br />(nome legível e assinatura)</div>
      </div>
      <p style={{ fontSize: 9, marginTop: 18, color: "#444" }}>Local e data: ______________________, ____ / ____ / ________ · Ficha nº {numero} gerada pelo ERP em {new Date().toLocaleDateString("pt-BR")}</p>
    </div>
  );
}
