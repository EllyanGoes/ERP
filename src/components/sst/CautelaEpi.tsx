"use client";

// Cautela de EPI — "Declaração de Recebimento de Equipamento de Proteção
// Individual e Responsabilidade de Uso e Guarda" (padrão SOC usado pela
// empresa): dados do funcionário, declaração (CLT 166/167, NR-06, NR-01),
// assinatura única e tabela dos EPIs (uma cautela = uma entrega numa data, então
// a assinatura do termo cobre todos os itens relacionados). A4 retrato; o
// escaneado volta pelo "Anexar termo assinado" da ficha.
// Usada na página de impressão (/sst/epis/fichas/[id]) e no popup da ficha do
// colaborador / da lista de fichas (emDialog: sem margem externa nem botão de
// imprimir próprio — o CautelaEpiDialog imprime na mesma aba).
// Barra de cima (não imprime): data da entrega e aviso de cadastro incompleto;
// com cadastro incompleto a impressão fica bloqueada até completar.
// Ficha de HISTÓRICO (historico=true): mesmo cabeçalho e declaração, mas a
// tabela tem a coluna de assinatura — cada retirada é escrita e assinada à mão
// na linha. Sai em branco (padrão) ou com os lançamentos já feitos (conferência
// / reimpressão).
import { useCallback, useEffect, useState } from "react";
import { fmtData } from "@/components/sst/comum";
import DatePicker from "@/components/shared/DatePicker";
import CadastroComplementarDialog, { AvisoCadastroIncompleto } from "@/components/sst/CadastroComplementarDialog";
import { camposFaltandoCautela } from "@/lib/sst-cadastro";
import { Loader2 } from "lucide-react";

type Ficha = {
  id: string; numero: number; data: string; observacoes: string | null; documentoId: string | null; historico: boolean; fechadaEm: string | null;
  empresa: { id: string; razaoSocial: string; nomeFantasia: string | null; cnpj: string; telefone: string | null; logradouro: string | null; numero: string | null; bairro: string | null; cidade: string | null; estado: string | null };
  colaborador: { id: string; nome: string; cpf: string | null; rg: string | null; matricula: string | null; cargo: string | null; dataAdmissao: string | null; setor: { id: string; nome: string } | null; sstFuncoes: { funcao: { nome: string; requisitosEpi?: { epi: { nome: string; ca: string | null } }[] } }[] };
  itens: { id: string; data: string; tipo: string; quantidade: number; tamanho: string | null; ca?: string | null; motivo: string | null; vencimentoUso: string | null; epi: { nome: string; ca: string | null; vidaUtilDias: number | null } }[];
};

// Logo impressa no cabeçalho, por empresa (sem logo: caixa com o nome).
// Quantidade de itens por extenso no termo (documento formal).
const EXTENSO = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove", "vinte"];
const LOGOS: Record<string, string> = { emp_tramontin: "/logos/tramontin.png" };
/** Linhas da ficha de histórico impressa (as já lançadas + em branco p/ completar). */
const LINHAS_HISTORICO = 30;

const faltandoDa = (c: Ficha["colaborador"]) => camposFaltandoCautela({ ...c, temFuncao: !!c.sstFuncoes[0] });

const fmtCnpj = (v: string) => (v.replace(/\D/g, "").length === 14 ? v.replace(/\D/g, "").replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : v);

export default function CautelaEpi({ id, emDialog = false, onFaltando }: {
  id: string; emDialog?: boolean;
  /** Avisa quem abriu (o popup) o que falta no cadastro — bloqueia o Imprimir de lá. */
  onFaltando?: (faltando: string[]) => void;
}) {
  const [f, setF] = useState<Ficha | null>(null);
  const carregar = useCallback(() => { fetch(`/api/sst/entregas/fichas/${id}`).then((r) => r.json()).then((j) => setF(j.data ?? null)).catch(() => {}); }, [id]);
  useEffect(() => { carregar(); }, [carregar]);
  const faltandoKey = f ? faltandoDa(f.colaborador).join(",") : null;
  useEffect(() => { if (faltandoKey !== null) onFaltando?.(faltandoKey ? faltandoKey.split(",") : []); }, [faltandoKey, onFaltando]);
  const [salvandoData, setSalvandoData] = useState(false);
  const [erroData, setErroData] = useState("");
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [preencher, setPreencher] = useState(false);
  if (!f) return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;

  async function mudarData(iso: string) {
    if (!iso || !f || iso === f.data.slice(0, 10)) return;
    setSalvandoData(true); setErroData("");
    const res = await fetch(`/api/sst/entregas/fichas/${f.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: iso }) });
    const j = await res.json().catch(() => ({}));
    setSalvandoData(false);
    if (!res.ok) { setErroData(j.error || "Erro ao salvar a data"); return; }
    carregar();
  }
  const faltando = faltandoDa(f.colaborador);
  const logo = LOGOS[f.empresa.id];

  const emp = f.empresa;
  const nomeEmpresa = (emp.nomeFantasia || emp.razaoSocial).toUpperCase();
  const endereco = [[emp.logradouro, emp.numero].filter(Boolean).join(", "), emp.bairro, [emp.cidade, emp.estado].filter(Boolean).join("/")].filter(Boolean).join(" · ");
  const cargo = (f.colaborador.sstFuncoes[0]?.funcao.nome.split(" — ")[0] ?? f.colaborador.cargo ?? "—").toUpperCase();
  const numero = String(f.numero).padStart(4, "0");

  const label = { fontWeight: 400, color: "#444" } as const;
  const val = { fontWeight: 700 } as const;
  const th = { border: "1px solid #000", padding: "4px 5px", fontSize: 9.5, fontWeight: 700, background: "#e9e9e9", textAlign: "center" as const };
  const td = { border: "1px solid #000", padding: "5px 5px", fontSize: 10, verticalAlign: "middle" as const };

  return (
    <div data-cautela={f.id} className={emDialog ? "bg-white text-black mx-auto" : "print-area bg-white text-black mx-auto my-4"} style={{ width: "190mm", padding: "8mm 9mm", fontFamily: "Arial, Helvetica, sans-serif", fontSize: 10.5, lineHeight: 1.35 }}>
      {!emDialog && <style>{`@media print { @page { size: A4 portrait; margin: 9mm; } }`}</style>}
      <div className="no-print mb-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {f.historico ? (
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={preencher} onChange={(e) => setPreencher(e.target.checked)} />
              Preencher com as {f.itens.length} entrega(s) lançada(s) <span className="text-xs text-gray-500">(desmarcado: linhas em branco p/ escrever à mão)</span>
            </label>
          ) : (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-600">Data da entrega</span>
            <div className="w-40"><DatePicker value={f.data.slice(0, 10)} onChange={mudarData} /></div>
            {salvandoData && <Loader2 className="w-4 h-4 animate-spin text-gray-500" />}
            {erroData && <span className="text-xs text-red-600">{erroData}</span>}
          </div>
          )}
          {!emDialog && <button onClick={() => window.print()} disabled={faltando.length > 0} title={faltando.length > 0 ? "Complete o cadastro antes de imprimir" : undefined} className="border border-gray-400 rounded px-3 py-1 text-sm disabled:opacity-40 disabled:cursor-not-allowed">Imprimir / Salvar PDF</button>}
        </div>
        <AvisoCadastroIncompleto faltando={faltando} onCompletar={() => setCadastroAberto(true)} bloqueia="complete para imprimir" />
      </div>
      <CadastroComplementarDialog open={cadastroAberto} onOpenChange={setCadastroAberto} colaborador={{ ...f.colaborador, temFuncao: !!f.colaborador.sstFuncoes[0] }} onSaved={carregar} />

      {/* Cabeçalho */}
      <div style={{ display: "flex", gap: 14, alignItems: "stretch", borderBottom: "2px solid #000", paddingBottom: 8 }}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- impressão: <img> simples sai no PDF sem depender do otimizador
          <img src={logo} alt={emp.nomeFantasia ?? emp.razaoSocial} style={{ width: 170, height: "auto", flexShrink: 0, objectFit: "contain", borderRadius: 4, alignSelf: "center" }} />
        ) : (
          <div style={{ width: 150, minHeight: 78, border: "1px solid #000", borderRadius: 4, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 6, textAlign: "center" }}>
            <div style={{ fontSize: 9, letterSpacing: 1, color: "#444" }}>CERÂMICA</div>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 0.5, lineHeight: 1 }}>{(emp.nomeFantasia ?? emp.razaoSocial).replace(/^cer[aâ]mica\s+/i, "")}</div>
            {emp.telefone && <div style={{ fontSize: 8.5, marginTop: 4, color: "#444" }}>{emp.telefone}</div>}
          </div>
        )}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.25, textTransform: "uppercase", letterSpacing: 0.3 }}>{f.historico ? "Ficha de Controle de Entrega de EPI e Responsabilidade de Uso e Guarda" : "Declaração de Recebimento de Equipamento de Proteção Individual e Responsabilidade de Uso e Guarda"}</div>
          <div style={{ marginTop: 6 }}>
            <div style={{ fontWeight: 700, fontSize: 11.5 }}>{emp.razaoSocial.toUpperCase()}</div>
            <div style={{ fontSize: 10 }}>CNPJ: {fmtCnpj(emp.cnpj)}{endereco ? ` · ${endereco}` : ""}</div>
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: 9.5, color: "#444", whiteSpace: "nowrap" }}>{f.historico ? "Ficha" : "Cautela"} nº <b style={{ color: "#000" }}>{numero}</b><br />{f.historico ? `aberta em ${fmtData(f.data)}` : fmtData(f.data)}</div>
      </div>

      {/* Informações do funcionário */}
      <div style={{ fontWeight: 700, fontSize: 11, margin: "9px 0 4px", borderBottom: "1px solid #000", paddingBottom: 2 }}>Informações do Funcionário</div>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", columnGap: 18, rowGap: 2, fontSize: 10.5 }}>
        <div><span style={label}>Funcionário: </span><span style={val}>{f.colaborador.nome.toUpperCase()}</span></div>
        <div><span style={label}>Setor: </span><span style={val}>{(f.colaborador.setor?.nome ?? "—").toUpperCase()}</span></div>
        <div><span style={label}>Empresa: </span><span style={val}>{emp.razaoSocial.toUpperCase()}</span></div>
        <div><span style={label}>Matrícula: </span><span style={val}>{f.colaborador.matricula ?? "—"}</span></div>
        <div><span style={label}>Cargo: </span><span style={val}>{cargo}</span></div>
        <div><span style={label}>Admissão: </span><span style={val}>{f.colaborador.dataAdmissao ? fmtData(f.colaborador.dataAdmissao) : "—"}</span></div>
        <div><span style={label}>Unidade: </span><span style={val}>{nomeEmpresa}</span></div>
        <div><span style={label}>CPF: </span><span style={val}>{f.colaborador.cpf ?? "—"}</span></div>
      </div>

      {/* Declaração */}
      <div style={{ marginTop: 10, textAlign: "justify", fontSize: 10 }}>
        <p>Eu, <b>{f.colaborador.nome.toUpperCase()}</b>, declaro para todos os efeitos previstos na legislação, haver recebido gratuitamente, conforme descrito na C.L.T. nos artigos 166, 167 e demais artigos adstritos à matéria, na NR-06 e nos itens 1.4.2 e 1.5.5.1.2 da NR-01 — Disposições Gerais e Gerenciamento de Riscos Ocupacionais, após treinamento e orientação do uso adequado, aplicação, guarda, conservação, substituição e requisitos de higiene, ministrados pelo Serviço Especializado em Segurança e Medicina do Trabalho da empresa <b>{emp.razaoSocial.toUpperCase()}</b>{endereco ? `, situada em ${endereco}` : ""}, {f.historico
          ? <>os equipamentos de proteção individual registrados na tabela “Registro de entregas” abaixo — cada recebimento confirmado por minha assinatura na respectiva linha, na data nela indicada —,</>
          : <>o(s) <b>{f.itens.length}{EXTENSO[f.itens.length] ? ` (${EXTENSO[f.itens.length]})` : ""} item(ns)</b> de equipamento de proteção individual relacionado(s) na tabela “Informações dos EPIs” abaixo e designado(s) como EPIs — todos recebidos nesta data e cobertos por esta assinatura —,</>} os quais obrigo-me a usá-lo(s) sistematicamente em meu trabalho, mediante ainda os termos seguintes:</p>
        <ol type="a" style={{ paddingLeft: 18, marginTop: 4 }}>
          <li>O EPI será usado unicamente para a finalidade a que se destina, e qualquer alteração que o torne parcial ou totalmente danificado será por mim comunicada à empresa;</li>
          <li>Declaro que me responsabilizo pela guarda e conservação dos EPIs que me foram confiados e que, na impossibilidade de seu uso, deverei comunicar à chefia imediatamente, para as providências que se fizerem necessárias, e os devolverei após o vencimento da duração estipulada;</li>
          <li>Estou ciente e de pleno acordo que a falta de uso, por mim, dos EPIs fornecidos pela empresa constitui ato faltoso, sujeito às sanções disciplinares previstas na legislação pertinente, no Regulamento Interno e nas Normas de Segurança da empresa;</li>
          <li>Reconheço expressamente que a sua não utilização configura falta grave capitulada na letra &quot;h&quot; do artigo 482 da C.L.T., como ato de indisciplina ou de insubordinação, ensejadora da rescisão do meu contrato de trabalho por justa causa;</li>
          <li>Autorizo expressamente a empresa a proceder descontos nos meus salários, vencimentos, gratificações e indenizações dos valores dos EPIs que porventura por mim forem: danificados propositadamente; extraviados; não devolvidos à empresa para substituição;</li>
          <li>Tomei ciência e estou de acordo com os termos da declaração acima, assinando-a de livre e espontânea vontade, após sua leitura nesta data.</li>
        </ol>
      </div>

      {/* Espaço folgado p/ a assinatura à mão; a data é a da entrega. */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 58 }}>
        <div style={{ fontSize: 10.5 }}>Data: <b>{fmtData(f.data)}</b></div>
        <div style={{ width: "46%", textAlign: "center", borderTop: "1px solid #000", paddingTop: 3, fontSize: 10 }}>{f.colaborador.nome.toUpperCase()}</div>
      </div>

      {f.historico ? (() => {
        const lancadas = preencher ? f.itens : [];
        const brancas = Math.max(LINHAS_HISTORICO - lancadas.length, 5);
        const daFuncao = f.colaborador.sstFuncoes[0]?.funcao.requisitosEpi ?? [];
        return <>
          {daFuncao.length > 0 && <p style={{ fontSize: 9, marginTop: 12 }}><b>EPIs da função:</b> {daFuncao.map((r) => `${r.epi.nome}${r.epi.ca ? ` (CA ${r.epi.ca})` : ""}`).join(" · ")}</p>}
          <div style={{ fontWeight: 700, fontSize: 11, margin: "10px 0 4px", borderBottom: "1px solid #000", paddingBottom: 2 }}>Registro de entregas</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...th, width: "12%" }}>Data</th>
                <th style={{ ...th, width: "6%" }}>Qtd.</th>
                <th style={{ ...th, textAlign: "left" }}>EPI</th>
                <th style={{ ...th, width: "9%" }}>CA</th>
                <th style={{ ...th, width: "7%" }}>Tam./cor</th>
                <th style={{ ...th, width: "30%" }}>Assinatura do colaborador</th>
              </tr>
            </thead>
            <tbody>
              {lancadas.map((it) => (
                <tr key={it.id} style={{ height: 26 }}>
                  <td style={{ ...td, textAlign: "center" }}>{fmtData(it.data)}</td>
                  <td style={{ ...td, textAlign: "center" }}>{it.quantidade}</td>
                  <td style={td}>{it.epi.nome.toUpperCase()}{it.tipo === "DEVOLUCAO" ? " (DEVOLUÇÃO)" : it.tipo === "TROCA" ? " (TROCA)" : ""}{it.motivo ? <span style={{ fontSize: 8.5, color: "#555" }}> — {it.motivo}</span> : null}</td>
                  <td style={{ ...td, textAlign: "center" }}>{it.ca || it.epi.ca || "—"}</td>
                  <td style={{ ...td, textAlign: "center" }}>{it.tamanho || ""}</td>
                  <td style={td}></td>
                </tr>
              ))}
              {Array.from({ length: brancas }, (_, k) => (
                <tr key={`b${k}`} style={{ height: 26 }}>{Array.from({ length: 6 }, (_, c) => <td key={c} style={td}></td>)}</tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 9, marginTop: 4 }}>Troca antes do prazo de uso: anotar o motivo na linha (dano, perda, extravio…).</p>
        </>;
      })() : <>
      {/* Informações dos EPIs */}
      <div style={{ fontWeight: 700, fontSize: 11, margin: "14px 0 4px", borderBottom: "1px solid #000", paddingBottom: 2 }}>Informações dos EPIs</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...th, width: "13%" }}>Data de entrega</th>
            <th style={{ ...th, width: "6%" }}>Qtd.</th>
            <th style={{ ...th, textAlign: "left" }}>EPI</th>
            <th style={{ ...th, width: "9%" }}>CA</th>
            <th style={{ ...th, width: "9%" }}>Tam./cor</th>
          </tr>
        </thead>
        <tbody>
          {f.itens.map((it) => (
            <tr key={it.id} style={{ height: 26 }}>
              <td style={{ ...td, textAlign: "center" }}>{fmtData(f.data)}</td>
              <td style={{ ...td, textAlign: "center" }}>{it.quantidade}</td>
              <td style={td}>{it.epi.nome.toUpperCase()}{it.tipo === "DEVOLUCAO" ? " (DEVOLUÇÃO)" : it.tipo === "TROCA" ? " (TROCA)" : ""}{it.motivo ? <span style={{ fontSize: 8.5, color: "#555" }}> — {it.motivo}</span> : null}</td>
              <td style={{ ...td, textAlign: "center" }}>{it.ca || it.epi.ca || "—"}</td>
              <td style={{ ...td, textAlign: "center" }}>{it.tamanho || "N/A"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 9, marginTop: 4, textAlign: "right" }}>Fim da relação — <b>{f.itens.length} item(ns)</b>, todos cobertos pela assinatura acima.</p>
      </>}
      {f.observacoes && <p style={{ fontSize: 9.5, marginTop: 6 }}><b>Observações:</b> {f.observacoes}</p>}
      <p style={{ fontSize: 8.5, marginTop: 10, color: "#555", display: "flex", justifyContent: "space-between" }}><span>{nomeEmpresa} · {f.historico ? "Ficha" : "Cautela"} de EPI nº {numero}</span><span>gerada pelo ERP em {new Date().toLocaleDateString("pt-BR")}</span></p>
    </div>
  );
}
