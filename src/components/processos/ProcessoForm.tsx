"use client";

// Cadastro/edição do processo externo. Na criação já aceita o 1º andamento
// (ex.: "14/10 — cadastro enviado ao SICARF"). Interessado pessoa física nasce
// confidencial (decisão do dono, PRD §9) — dá para desmarcar.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import SelectMenu from "@/components/shared/SelectMenu";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import DatePicker from "@/components/shared/DatePicker";
import { useCreateDrawer } from "@/components/shared/CreateDrawer";
import { ESFERAS, RISCOS, SITUACOES, TIPOS_ANDAMENTO, TIPOS_PROCESSO, api, useLookups } from "./comum";
import { mascaraCnj, soDigitos, validarCnj } from "@/lib/processos-cnj";
import { BASES, useRoteiros } from "./roteiros";

export type ProcessoValores = {
  titulo: string; tipo: string; orgao: string; esfera: string; numero: string; portalUrl: string; polo: string;
  interessadoTipo: string; interessadoNome: string; assunto: string; situacao: string; fase: string; abertoEm: string;
  responsavelId: string; advogado: string; valorCausa: string; riscoPerda: string; confidencial: boolean; imovel: string;
  tags: string; observacoes: string; diasSemAndamentoAlerta: string; numerosExtras: { rotulo: string; valor: string }[];
  datajudAtivo: boolean;
};
export const VAZIO: ProcessoValores = {
  titulo: "", tipo: "ADMINISTRATIVO", orgao: "", esfera: "", numero: "", portalUrl: "", polo: "", interessadoTipo: "EMPRESA", interessadoNome: "",
  assunto: "", situacao: "EM_ANDAMENTO", fase: "", abertoEm: "", responsavelId: "", advogado: "", valorCausa: "", riscoPerda: "", confidencial: false,
  imovel: "", tags: "", observacoes: "", diasSemAndamentoAlerta: "60", numerosExtras: [], datajudAtivo: false,
};

const Sec = ({ t, children }: { t: string; children: React.ReactNode }) => (
  <section className="space-y-3"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t}</h3>{children}</section>
);

export default function ProcessoForm({ inicial, processoId, onSalvo }: { inicial?: Partial<ProcessoValores>; processoId?: string; onSalvo?: () => void }) {
  const router = useRouter();
  const drawer = useCreateDrawer();
  const lk = useLookups();
  const [v, setV] = useState<ProcessoValores>({ ...VAZIO, ...inicial });
  const [ini, setIni] = useState({ data: "", tipo: "PROTOCOLO", descricao: "" });
  const [saving, setSaving] = useState(false); const [erro, setErro] = useState("");
  // Roteiro (tarefas padrão) do tipo — só na criação; trocar o tipo limpa a escolha.
  const roteiros = useRoteiros(processoId ? undefined : v.tipo);
  const [roteiroId, setRoteiroId] = useState("");
  const roteiro = roteiros.find((r) => r.id === roteiroId);
  const set = <K extends keyof ProcessoValores>(k: K, val: ProcessoValores[K]) => setV((x) => ({ ...x, [k]: val }));
  // Número CNJ: máscara no judicial (ou quando já parece CNJ); tribunal detectado p/ o DataJud.
  const usaCnj = v.tipo === "JUDICIAL" || soDigitos(v.numero).length === 20;
  const cnj = usaCnj && soDigitos(v.numero) ? validarCnj(v.numero) : null;
  const podeAcompanhar = !!(cnj?.ok && cnj.info.tribunal);

  async function salvar() {
    if (!v.titulo.trim()) { setErro("Informe o título."); return; }
    if (!v.orgao.trim()) { setErro("Informe o órgão (ou vara/tribunal)."); return; }
    if (v.datajudAtivo && !podeAcompanhar) { setErro(cnj && !cnj.ok ? cnj.erro : "Para acompanhar no tribunal, informe um número CNJ válido."); return; }
    setSaving(true); setErro("");
    const body = { ...v, numerosExtras: v.numerosExtras.filter((n) => n.valor.trim()), ...(processoId ? {} : { andamentoInicial: ini.descricao.trim() ? ini : undefined, roteiroId: roteiro ? roteiro.id : undefined, dataCiencia: ini.data || undefined }) };
    const r = await api<{ id: string }>(processoId ? `/api/processos/${processoId}` : "/api/processos", processoId ? "PATCH" : "POST", body);
    setSaving(false);
    if (!r.ok) { setErro(r.error!); return; }
    // Acompanhamento recém-ligado: dispara a 1ª captura (a ficha mostra o resultado).
    const idAlvo = processoId ?? r.data!.id;
    if (v.datajudAtivo && !inicial?.datajudAtivo) fetch(`/api/processos/${idAlvo}/datajud`, { method: "POST" }).then(() => onSalvo?.()).catch(() => {});
    if (processoId) { onSalvo?.(); return; }
    drawer?.aposCriar();
    router.push(`/processos/${r.data!.id}`);
  }

  return (
    <div className="space-y-6">
      <Sec t="Identificação">
        <div><Label>Título *</Label><Input value={v.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Regularização fundiária — Fazenda Luciana" /></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><Label>Tipo</Label><SelectMenu value={v.tipo} onChange={(x) => { set("tipo", x); setRoteiroId(""); }} options={Object.entries(TIPOS_PROCESSO).map(([value, label]) => ({ value, label }))} /></div>
          <div className="sm:col-span-2"><Label>Órgão / vara *</Label><Input value={v.orgao} onChange={(e) => set("orgao", e.target.value)} placeholder="Amapá Terras (Instituto de Terras do Amapá)" /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><Label>Esfera</Label><SelectMenu value={v.esfera} onChange={(x) => set("esfera", x)} options={[{ value: "", label: "—" }, ...Object.entries(ESFERAS).map(([value, label]) => ({ value, label }))]} /></div>
          <div><Label>{v.tipo === "JUDICIAL" ? "Número CNJ" : "Número do processo"}</Label>
            <Input value={v.numero} onChange={(e) => set("numero", usaCnj ? mascaraCnj(e.target.value) : e.target.value)} placeholder={v.tipo === "JUDICIAL" ? "0000000-00.0000.0.00.0000" : "101401119/2026"} className={usaCnj ? "font-mono" : undefined} />
            {cnj && <p className={`text-[11px] mt-1 ${cnj.ok ? "text-muted-foreground" : "text-danger"}`}>{cnj.ok ? (cnj.info.tribunalNome ? `Tribunal: ${cnj.info.tribunalNome}` : "Tribunal fora da API pública do DataJud") : cnj.erro}</p>}
          </div>
          <div><Label>Aberto em</Label><DatePicker value={v.abertoEm} onChange={(x) => set("abertoEm", x ?? "")} /></div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between"><Label>Outros números (protocolo, recibo…)</Label>
            <button type="button" className="text-xs text-info hover:underline inline-flex items-center gap-1" onClick={() => set("numerosExtras", [...v.numerosExtras, { rotulo: "", valor: "" }])}><Plus className="w-3 h-3" /> número</button></div>
          {v.numerosExtras.map((n, i) => (
            <div key={i} className="flex gap-2">
              <Input className="w-48" value={n.rotulo} placeholder="Recibo SICARF" onChange={(e) => set("numerosExtras", v.numerosExtras.map((x, k) => (k === i ? { ...x, rotulo: e.target.value } : x)))} />
              <Input className="flex-1" value={n.valor} placeholder="8D9C01-8D49001-2026" onChange={(e) => set("numerosExtras", v.numerosExtras.map((x, k) => (k === i ? { ...x, valor: e.target.value } : x)))} />
              <button type="button" className="text-muted-foreground hover:text-danger" onClick={() => set("numerosExtras", v.numerosExtras.filter((_, k) => k !== i))}><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        {(v.tipo === "JUDICIAL" || podeAcompanhar) && (
          <label className={`flex items-start gap-2 text-sm rounded-lg border p-3 ${podeAcompanhar ? "border-border" : "border-border opacity-60"}`}>
            <input type="checkbox" className="rounded mt-0.5" disabled={!podeAcompanhar && !v.datajudAtivo} checked={v.datajudAtivo} onChange={(e) => set("datajudAtivo", e.target.checked)} />
            <span>Acompanhar automaticamente (DataJud)
              <span className="block text-xs text-muted-foreground">Todo dia o sistema busca os andamentos no tribunal e avisa o responsável das novidades importantes. {podeAcompanhar ? "" : "Informe um número CNJ válido para ligar."}</span>
            </span>
          </label>
        )}
        <div><Label>Link do portal</Label><Input value={v.portalUrl} onChange={(e) => set("portalUrl", e.target.value)} placeholder="https://sicarf.amapaterras.ap.gov.br" /></div>
        <div><Label>Assunto</Label><Textarea rows={2} value={v.assunto} onChange={(e) => set("assunto", e.target.value)} placeholder="O que se pede / do que se trata" /></div>
      </Sec>

      <Sec t="Interessado e responsáveis">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><Label>Interessado</Label><SelectMenu value={v.interessadoTipo} onChange={(x) => setV((s) => ({ ...s, interessadoTipo: x, confidencial: processoId ? s.confidencial : x === "PESSOA" }))} options={[{ value: "EMPRESA", label: "A empresa" }, { value: "PESSOA", label: "Pessoa física" }]} /></div>
          <div className="sm:col-span-2"><Label>Nome do interessado</Label><Input value={v.interessadoNome} onChange={(e) => set("interessadoNome", e.target.value)} placeholder={v.interessadoTipo === "PESSOA" ? "Nome da pessoa" : "(a própria empresa)"} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><Label>Responsável (recebe os alertas)</Label><ComboboxWithCreate value={v.responsavelId} onChange={(x) => set("responsavelId", x)} allowNone options={lk.usuarios.map((u) => ({ value: u.id, label: u.nome }))} placeholder="Você" /></div>
          <div><Label>Advogado / despachante</Label><Input value={v.advogado} onChange={(e) => set("advogado", e.target.value)} placeholder="Nome, OAB, escritório" /></div>
          <div><Label>Polo</Label><SelectMenu value={v.polo} onChange={(x) => set("polo", x)} options={[{ value: "", label: "—" }, { value: "REQUERENTE", label: "Requerente" }, { value: "INTERESSADO", label: "Interessado" }, { value: "AUTOR", label: "Autor" }, { value: "REU", label: "Réu" }]} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="rounded" checked={v.confidencial} onChange={(e) => set("confidencial", e.target.checked)} /> Confidencial — só o responsável e quem tem permissão veem</label>
      </Sec>

      <Sec t="Situação e valores">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><Label>Situação</Label><SelectMenu value={v.situacao} onChange={(x) => set("situacao", x)} options={Object.entries(SITUACOES).map(([value, s]) => ({ value, label: s.label }))} /></div>
          <div><Label>Fase</Label><Input value={v.fase} onChange={(e) => set("fase", e.target.value)} placeholder="Análise técnica, vistoria, recurso…" /></div>
          <div><Label>Alertar se parado há (dias)</Label><Input inputMode="numeric" value={v.diasSemAndamentoAlerta} onChange={(e) => set("diasSemAndamentoAlerta", e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><Label>Valor em discussão (R$)</Label><Input inputMode="decimal" value={v.valorCausa} onChange={(e) => set("valorCausa", e.target.value)} placeholder="multa, causa, débito" /></div>
          <div><Label>Risco de perda (CPC 25)</Label><SelectMenu value={v.riscoPerda} onChange={(x) => set("riscoPerda", x)} options={[{ value: "", label: "—" }, ...Object.entries(RISCOS).map(([value, label]) => ({ value, label }))]} /></div>
          <div><Label>Imóvel / bem</Label><Input value={v.imovel} onChange={(e) => set("imovel", e.target.value)} placeholder="Fazenda Luciana" /></div>
        </div>
        <div><Label>Tags</Label><Input value={v.tags} onChange={(e) => set("tags", e.target.value)} placeholder="separadas por vírgula" /></div>
        <div><Label>Observações</Label><Textarea rows={2} value={v.observacoes} onChange={(e) => set("observacoes", e.target.value)} /></div>
      </Sec>

      {!processoId && (
        <Sec t="Primeiro andamento (opcional)">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><Label>Data</Label><DatePicker value={ini.data} onChange={(x) => setIni({ ...ini, data: x ?? "" })} /></div>
            <div className="sm:col-span-2"><Label>Tipo</Label><SelectMenu value={ini.tipo} onChange={(x) => setIni({ ...ini, tipo: x })} options={Object.entries(TIPOS_ANDAMENTO).map(([value, label]) => ({ value, label }))} /></div>
          </div>
          <div><Label>O que aconteceu</Label><Textarea rows={2} value={ini.descricao} onChange={(e) => setIni({ ...ini, descricao: e.target.value })} placeholder="Cadastro enviado ao SICARF (recibo …)" /></div>
        </Sec>
      )}

      {!processoId && roteiros.length > 0 && (
        <Sec t="Roteiro (tarefas padrão)">
          <SelectMenu value={roteiroId} onChange={setRoteiroId} options={[{ value: "", label: "Não aplicar" }, ...roteiros.map((r) => ({ value: r.id, label: `${r.nome} (${r.etapas.length} etapas)` }))]} />
          {roteiro && <ul className="text-xs text-muted-foreground space-y-0.5">{roteiro.etapas.map((e, i) => <li key={i}>• {e.titulo} — {e.dias} dia(s) {e.diasUteis ? "úteis" : "corridos"} {BASES[e.base] ?? ""}</li>)}</ul>}
          {roteiro && <p className="text-[11px] text-muted-foreground">Cada etapa vira um prazo, contado da data de abertura (ou da data do 1º andamento, para as etapas &quot;da ciência&quot;). Dá para editar depois.</p>}
        </Sec>
      )}

      {erro && <p className="text-sm text-danger">{erro}</p>}
      <div className="flex justify-end gap-2">
        {drawer && <Button variant="outline" onClick={drawer.fechar} disabled={saving}>Cancelar</Button>}
        <Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : processoId ? "Salvar alterações" : "Cadastrar processo"}</Button>
      </div>
    </div>
  );
}
