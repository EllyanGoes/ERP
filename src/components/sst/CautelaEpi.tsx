"use client";

// Cautela de EPI — "Declaração de Recebimento de Equipamento de Proteção
// Individual e Responsabilidade de Uso e Guarda" (padrão SOC usado pela
// empresa): dados do funcionário, declaração (CLT 166/167, NR-06, NR-01),
// assinatura e tabela dos EPIs com assinatura por item. A4 retrato; o
// escaneado volta pelo "Anexar termo assinado" da ficha.
// Usada na página de impressão (/sst/epis/fichas/[id]) e no popup da ficha do
// colaborador (emDialog: sem margem externa nem botão de imprimir próprio).
// Barra de cima (não imprime): data da entrega e aviso de cadastro incompleto.
import { useCallback, useEffect, useState } from "react";
import { fmtData } from "@/components/sst/comum";
import DatePicker from "@/components/shared/DatePicker";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Loader2 } from "lucide-react";

type Ficha = {
  id: string; numero: number; data: string; observacoes: string | null; documentoId: string | null;
  empresa: { id: string; razaoSocial: string; nomeFantasia: string | null; cnpj: string; telefone: string | null; logradouro: string | null; numero: string | null; bairro: string | null; cidade: string | null; estado: string | null };
  colaborador: { id: string; nome: string; cpf: string | null; rg: string | null; matricula: string | null; cargo: string | null; dataAdmissao: string | null; setor: { id: string; nome: string } | null; sstFuncoes: { funcao: { nome: string } }[] };
  itens: { id: string; tipo: string; quantidade: number; tamanho: string | null; motivo: string | null; vencimentoUso: string | null; epi: { nome: string; ca: string | null; vidaUtilDias: number | null } }[];
};

// Logo impressa no cabeçalho, por empresa (sem logo: caixa com o nome).
const LOGOS: Record<string, string> = { emp_tramontin: "/logos/tramontin.png" };

// Campos do cadastro que a cautela imprime e que costumam faltar.
function camposFaltando(c: Ficha["colaborador"]) {
  return [
    !c.cpf && "CPF", !c.rg && "RG", !c.matricula && "Matrícula", !c.dataAdmissao && "Admissão", !c.setor && "Setor",
    !c.sstFuncoes[0] && !c.cargo && "Cargo",
  ].filter(Boolean) as string[];
}

const fmtCnpj = (v: string) => (v.replace(/\D/g, "").length === 14 ? v.replace(/\D/g, "").replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : v);

export default function CautelaEpi({ id, emDialog = false }: { id: string; emDialog?: boolean }) {
  const [f, setF] = useState<Ficha | null>(null);
  const carregar = useCallback(() => { fetch(`/api/sst/entregas/fichas/${id}`).then((r) => r.json()).then((j) => setF(j.data ?? null)).catch(() => {}); }, [id]);
  useEffect(() => { carregar(); }, [carregar]);
  const [salvandoData, setSalvandoData] = useState(false);
  const [erroData, setErroData] = useState("");
  const [cadastroAberto, setCadastroAberto] = useState(false);
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
  const faltando = camposFaltando(f.colaborador);
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
    <div className={emDialog ? "bg-white text-black mx-auto" : "print-area bg-white text-black mx-auto my-4"} style={{ width: "190mm", padding: "8mm 9mm", fontFamily: "Arial, Helvetica, sans-serif", fontSize: 10.5, lineHeight: 1.35 }}>
      {!emDialog && <style>{`@media print { @page { size: A4 portrait; margin: 9mm; } }`}</style>}
      <div className="no-print mb-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-600">Data da entrega</span>
            <div className="w-40"><DatePicker value={f.data.slice(0, 10)} onChange={mudarData} /></div>
            {salvandoData && <Loader2 className="w-4 h-4 animate-spin text-gray-500" />}
            {erroData && <span className="text-xs text-red-600">{erroData}</span>}
          </div>
          {!emDialog && <button onClick={() => window.print()} className="border border-gray-400 rounded px-3 py-1 text-sm">Imprimir / Salvar PDF</button>}
        </div>
        {faltando.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span className="flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0" /> Cadastro incompleto — falta: <b>{faltando.join(", ")}</b></span>
            <button onClick={() => setCadastroAberto(true)} className="rounded border border-amber-400 bg-white px-2.5 py-0.5 text-xs font-medium hover:bg-amber-100">Completar cadastro</button>
          </div>
        )}
      </div>
      <CadastroComplementarDialog open={cadastroAberto} onOpenChange={setCadastroAberto} colaborador={f.colaborador} onSaved={carregar} />

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
          <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.25, textTransform: "uppercase", letterSpacing: 0.3 }}>Declaração de Recebimento de Equipamento de Proteção Individual e Responsabilidade de Uso e Guarda</div>
          <div style={{ marginTop: 6 }}>
            <div style={{ fontWeight: 700, fontSize: 11.5 }}>{emp.razaoSocial.toUpperCase()}</div>
            <div style={{ fontSize: 10 }}>CNPJ: {fmtCnpj(emp.cnpj)}{endereco ? ` · ${endereco}` : ""}</div>
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: 9.5, color: "#444", whiteSpace: "nowrap" }}>Cautela nº <b style={{ color: "#000" }}>{numero}</b><br />{fmtData(f.data)}</div>
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
        <div><span style={label}>CPF: </span><span style={val}>{f.colaborador.cpf ?? "—"}</span>{"   "}<span style={label}>RG: </span><span style={val}>{f.colaborador.rg ?? "—"}</span></div>
      </div>

      {/* Declaração */}
      <div style={{ marginTop: 10, textAlign: "justify", fontSize: 10 }}>
        <p>Eu, <b>{f.colaborador.nome.toUpperCase()}</b>, declaro para todos os efeitos previstos na legislação, haver recebido gratuitamente, conforme descrito na C.L.T. nos artigos 166, 167 e demais artigos adstritos à matéria, na NR-06 e nos itens 1.4.2 e 1.5.5.1.2 da NR-01 — Disposições Gerais e Gerenciamento de Riscos Ocupacionais, após treinamento e orientação do uso adequado, aplicação, guarda, conservação, substituição e requisitos de higiene, ministrados pelo Serviço Especializado em Segurança e Medicina do Trabalho da empresa <b>{emp.razaoSocial.toUpperCase()}</b>{endereco ? `, situada em ${endereco}` : ""}, o(s) equipamento(s) de proteção individual abaixo descrito(s) e designado(s) como EPIs, os quais obrigo-me a usá-lo(s) sistematicamente em meu trabalho, mediante ainda os termos seguintes:</p>
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

      {/* Informações dos EPIs */}
      <div style={{ fontWeight: 700, fontSize: 11, margin: "14px 0 4px", borderBottom: "1px solid #000", paddingBottom: 2 }}>Informações dos EPIs</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...th, width: "13%" }}>Data de entrega</th>
            <th style={{ ...th, width: "6%" }}>Qtd.</th>
            <th style={{ ...th, textAlign: "left" }}>EPI</th>
            <th style={{ ...th, width: "9%" }}>CA</th>
            <th style={{ ...th, width: "9%" }}>Tamanho</th>
            <th style={{ ...th, width: "26%" }}>Assinatura</th>
            <th style={{ ...th, width: "7%" }}>Ativo</th>
          </tr>
        </thead>
        <tbody>
          {f.itens.map((it) => (
            <tr key={it.id} style={{ height: 40 }}>
              <td style={{ ...td, textAlign: "center" }}>{fmtData(f.data)}</td>
              <td style={{ ...td, textAlign: "center" }}>{it.quantidade}</td>
              <td style={td}>{it.epi.nome.toUpperCase()}{it.tipo === "DEVOLUCAO" ? " (DEVOLUÇÃO)" : it.tipo === "TROCA" ? " (TROCA)" : ""}{it.motivo ? <span style={{ fontSize: 8.5, color: "#555" }}> — {it.motivo}</span> : null}</td>
              <td style={{ ...td, textAlign: "center" }}>{it.epi.ca ?? "—"}</td>
              <td style={{ ...td, textAlign: "center" }}>{it.tamanho || "N/A"}</td>
              <td style={td}></td>
              <td style={{ ...td, textAlign: "center" }}>{it.tipo === "DEVOLUCAO" ? "Não" : "Sim"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {f.observacoes && <p style={{ fontSize: 9.5, marginTop: 6 }}><b>Observações:</b> {f.observacoes}</p>}
      <p style={{ fontSize: 8.5, marginTop: 10, color: "#555", display: "flex", justifyContent: "space-between" }}><span>{nomeEmpresa} · Cautela de EPI nº {numero}</span><span>gerada pelo ERP em {new Date().toLocaleDateString("pt-BR")}</span></p>
    </div>
  );
}

// Informações complementares do colaborador (as que a cautela imprime).
function CadastroComplementarDialog({ open, onOpenChange, colaborador: c, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; colaborador: Ficha["colaborador"]; onSaved: () => void }) {
  const [cpf, setCpf] = useState(""); const [rg, setRg] = useState(""); const [matricula, setMatricula] = useState("");
  const [cargo, setCargo] = useState(""); const [admissao, setAdmissao] = useState(""); const [setorId, setSetorId] = useState("");
  const [setores, setSetores] = useState<{ value: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false); const [erro, setErro] = useState("");
  useEffect(() => {
    if (!open) return;
    setCpf(c.cpf ?? ""); setRg(c.rg ?? ""); setMatricula(c.matricula ?? ""); setCargo(c.cargo ?? "");
    setAdmissao(c.dataAdmissao?.slice(0, 10) ?? ""); setSetorId(c.setor?.id ?? ""); setErro("");
    fetch("/api/empresa/setores?ativo=true").then((r) => r.json()).then((j: { id: string; nome: string }[]) => setSetores(Array.isArray(j) ? j.map((s) => ({ value: s.id, label: s.nome })) : [])).catch(() => {});
  }, [open, c]);
  async function salvar() {
    setSaving(true); setErro("");
    const res = await fetch(`/api/sst/colaboradores/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cpf, rg, matricula, cargo, dataAdmissao: admissao || null, setorId: setorId || null }) });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setErro(j.error || "Erro ao salvar"); return; }
    onOpenChange(false); onSaved();
  }
  const marca = (vazio: boolean) => (vazio ? "border-amber-400" : "");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Informações complementares — {c.nome}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>CPF</Label><Input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" className={marca(!cpf)} /></div>
          <div><Label>RG</Label><Input value={rg} onChange={(e) => setRg(e.target.value)} className={marca(!rg)} /></div>
          <div><Label>Matrícula</Label><Input value={matricula} onChange={(e) => setMatricula(e.target.value)} className={marca(!matricula)} /></div>
          <div><Label>Admissão</Label><DatePicker value={admissao} onChange={setAdmissao} /></div>
          <div className="col-span-2"><Label>Setor</Label><ComboboxWithCreate options={setores} value={setorId} onChange={setSetorId} placeholder="Selecione o setor" /></div>
          {!c.sstFuncoes[0] && <div className="col-span-2"><Label>Cargo</Label><Input value={cargo} onChange={(e) => setCargo(e.target.value)} className={marca(!cargo)} /></div>}
        </div>
        {erro && <p className="text-sm text-danger">{erro}</p>}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
