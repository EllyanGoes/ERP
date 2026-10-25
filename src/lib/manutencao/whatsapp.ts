// ─────────────────────────────────────────────────────────────────────────────
// Envio da OS por WhatsApp (link público /os/<linkToken>) — funções PURAS, usadas
// tanto na rota interna (/api/pcm/os/[id]/link) quanto no dialog do cliente.
// Sem API oficial: o ERP só monta o link wa.me com o texto pronto; quem envia é o
// WhatsApp de quem clicou. Datas sempre no fuso de Brasília.
// ─────────────────────────────────────────────────────────────────────────────

const TZ = "America/Sao_Paulo";

/** Só dígitos, com DDI 55 na frente (se já vier com 55 + DDD + número, não duplica). */
export function telefoneWa(tel: string | null | undefined): string {
  const d = (tel ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (!d) return "";
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
  return `55${d}`;
}

/** Telefone válido para o wa.me: 55 + DDD + 8/9 dígitos. */
export function telefoneValido(tel: string | null | undefined): boolean {
  const d = telefoneWa(tel);
  return d.length === 12 || d.length === 13;
}

/** "(92) 99123-4567" — para mostrar e para o histórico da OS. */
export function formatarTelefone(tel: string | null | undefined): string {
  let d = (tel ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return tel ?? "";
}

export function linkWhatsapp(tel: string, mensagem: string): string {
  return `https://wa.me/${telefoneWa(tel)}?text=${encodeURIComponent(mensagem)}`;
}

const PRIORIDADE_TXT: Record<string, string> = { EMERGENCIA: "Emergência", ALTA: "Alta", MEDIA: "Média", BAIXA: "Baixa" };

/** "25/10" */
const diaMes = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
/** "08:00" */
const hora = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

export type ResumoMensagemOS = {
  numero: string;
  tipoNome: string;
  prioridade: string;
  ativo: { tag: string; nome: string } | null;
  /** Localização do ativo (ou o último nível do caminho / local em texto). */
  local: string | null;
  descricao: string;
  programadaPara: string | null;
  prazo: string | null;
};

/**
 * Texto padrão da mensagem (editável no dialog):
 * 🔧 *OS-2572* — Corretiva programada · prioridade Alta
 * 📍 EXA-0008 Exaustor 08 (Reciclo) · Pré-forno
 * 📝 Soldagem de tubulação do reciclo
 * 📅 Programada 25/10 às 08:00 · prazo 26/10
 * 👉 Abrir: <url>
 */
export function mensagemPadraoOS(r: ResumoMensagemOS, url: string): string {
  const linhas: string[] = [];
  linhas.push(`🔧 *${r.numero}* — ${r.tipoNome} · prioridade ${PRIORIDADE_TXT[r.prioridade] ?? r.prioridade}`);
  const onde = [r.ativo ? `${r.ativo.tag} ${r.ativo.nome}` : null, r.local].filter(Boolean).join(" · ");
  if (onde) linhas.push(`📍 ${onde}`);
  const desc = r.descricao.split("\n")[0].trim();
  if (desc) linhas.push(`📝 ${desc.length > 200 ? `${desc.slice(0, 197)}…` : desc}`);
  const quando: string[] = [];
  if (r.programadaPara) { const d = new Date(r.programadaPara); quando.push(`Programada ${diaMes(d)} às ${hora(d)}`); }
  if (r.prazo) quando.push(`${quando.length ? "prazo" : "Prazo"} ${diaMes(new Date(r.prazo))}`);
  if (quando.length) linhas.push(`📅 ${quando.join(" · ")}`);
  linhas.push(`👉 Abrir: ${url}`);
  return linhas.join("\n");
}
