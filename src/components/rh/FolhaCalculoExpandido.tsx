"use client";

import { cn, formatBRL } from "@/lib/utils";
import { calcularInssProgressivo, type FaixaInss } from "@/components/rh/InssConfigDialog";
import RubricaGroup, { type RubricaLinha } from "@/components/rh/RubricaGroup";
import VerificacaoBadge from "@/components/rh/VerificacaoBadge";
import EncargosPatronaisBar from "@/components/rh/EncargosPatronaisBar";
import { Info, Palmtree, FileX2, UserMinus } from "lucide-react";

// Detalhamento importado do PDF (JSON FolhaItem.rubricas).
export type Rubrica = { codigo?: string; descricao: string; referencia?: string; tipo: "P" | "D"; valor: number };
export type Detalhe = {
  baseInss?: number | null; baseFgts?: number | null; baseIrrf?: number | null;
  totalProventos?: number | null; totalDescontos?: number | null;
  itens?: Rubrica[];
} | null;

type Valores = { bruto: number; liquido: number; inssRetido: number; inssPatronal: number; irrf: number; fgts: number };

const norm = (s: string) => s.toUpperCase();
const cod = (r: Rubrica) => (r.codigo ?? "").replace(/^0+/, "");

// ── Agrupamento pedagógico das rubricas ──────────────────────────────────────
const GRUPOS_PROVENTO = ["Salário", "Adicionais", "Horas extras + DSR", "Benefícios", "Outros proventos"] as const;
function grupoProvento(r: Rubrica): (typeof GRUPOS_PROVENTO)[number] {
  const d = norm(r.descricao);
  if (/SAL[ÁA]RIO\s*FAM/.test(d)) return "Benefícios";
  if (/HORA EXTRA|(^|\s)DSR($|\s)/.test(d)) return "Horas extras + DSR";
  if (/INSALUBRIDAD|PERICULOSIDADE|NOTURNO|ADICIONAL/.test(d)) return "Adicionais";
  if (/SAL[ÁA]RIO|VENCIMENTO|ORDENADO/.test(d)) return "Salário";
  return "Outros proventos";
}

const GRUPOS_DESCONTO = ["Tributos", "Ausências", "Antecipações", "Compensações", "Consignados / Outros"] as const;
function grupoDesconto(r: Rubrica): (typeof GRUPOS_DESCONTO)[number] {
  const d = norm(r.descricao);
  const c = cod(r);
  if (c === "998" || c === "999" || /RESCIS|COMPENSA/.test(d)) return "Compensações";
  if (/INSS|IRRF|IRF\b|IMPOSTO/.test(d)) return "Tributos";
  if (/FALTA|DESCONTO DSR|ATRASO/.test(d)) return "Ausências";
  if (/ADIANTAMENTO/.test(d)) return "Antecipações";
  return "Consignados / Outros";
}

function linha(r: Rubrica, extra?: Partial<RubricaLinha>): RubricaLinha {
  return { codigo: r.codigo, descricao: r.descricao, referencia: r.referencia || undefined, valor: r.valor, ...extra };
}

/**
 * Painel expandido do funcionário: fluxo PROVENTOS − DESCONTOS = LÍQUIDO com
 * as rubricas do PDF agrupadas, bases de cálculo explicadas, conferências e
 * encargos patronais separados. Só exibe — não altera nenhum cálculo/fluxo.
 */
export default function FolhaCalculoExpandido({
  detalhe,
  valores,
  faixasInss,
}: {
  detalhe: Detalhe;
  valores: Valores;
  faixasInss: FaixaInss[];
}) {
  const det = detalhe;
  if (!det || (det.baseInss == null && !(det.itens?.length))) {
    return (
      <p className="text-sm text-muted-foreground">
        Sem detalhamento importado para este item — clique em <span className="font-medium">Reextrair</span> para trazer as rubricas e bases do PDF.
      </p>
    );
  }

  const rubricas = det.itens ?? [];
  const proventos = rubricas.filter((r) => r.tipo === "P");
  const descontos = rubricas.filter((r) => r.tipo === "D");
  const somaProventos = Math.round(proventos.reduce((a, r) => a + r.valor, 0) * 100) / 100;
  const somaDescontos = Math.round(descontos.reduce((a, r) => a + r.valor, 0) * 100) / 100;
  const totalProventos = det.totalProventos ?? somaProventos;
  const totalDescontos = det.totalDescontos ?? somaDescontos;

  // ── Casos especiais ─────────────────────────────────────────────────────────
  const temFerias = rubricas.some((r) => ["998", "1001", "1002"].includes(cod(r)) || /F[ÉE]RIAS/.test(norm(r.descricao)));
  const temRescisao = rubricas.some((r) => cod(r) === "999" || /RESCIS/.test(norm(r.descricao)));
  const afastado = totalProventos === 0 && valores.liquido === 0 && proventos.length === 0;

  if (afastado) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <UserMinus className="w-4 h-4 shrink-0" />
        Funcionário sem proventos na competência (afastamento/licença) — confira o motivo e o período no PDF da folha.
      </div>
    );
  }

  // ── Conferências ────────────────────────────────────────────────────────────
  // Pensão/afastamento parcial podem zerar a base do INSS — base 0 é válida,
  // não há o que conferir (esperado = null esconde o badge).
  const inssEsperado = det.baseInss != null && det.baseInss > 0 && faixasInss.length
    ? calcularInssProgressivo(det.baseInss, faixasInss)
    : null;
  const fgtsEsperado = det.baseFgts != null ? Math.round(det.baseFgts * 8) / 100 : null;
  const liquidoEsperado = Math.round((totalProventos - totalDescontos) * 100) / 100;

  // ── Linhas por grupo, com tags/tooltips/badges nos pontos certos ────────────
  const linhasProvento = (g: (typeof GRUPOS_PROVENTO)[number]) =>
    proventos.filter((r) => grupoProvento(r) === g).map((r) =>
      linha(r, g === "Benefícios" ? { tag: "não tributável" } : undefined),
    );
  const linhasDesconto = (g: (typeof GRUPOS_DESCONTO)[number]) =>
    descontos.filter((r) => grupoDesconto(r) === g).map((r) => {
      const d = norm(r.descricao);
      if (g === "Tributos" && /INSS/.test(d)) {
        return linha(r, { badge: <VerificacaoBadge label="tabela × base" esperado={inssEsperado} valor={r.valor} /> });
      }
      if (g === "Antecipações") {
        return linha(r, { tooltip: "Valor já pago no meio do mês, abatido aqui." });
      }
      if (g === "Compensações") {
        return linha(r, { tag: "compensação" });
      }
      return linha(r);
    });

  const colunaTitulo = (op: string, titulo: string) => (
    <p className="text-xs font-bold text-foreground uppercase tracking-wide mb-2">
      <span className="inline-flex w-5 h-5 items-center justify-center rounded bg-muted mr-1.5 text-muted-foreground">{op}</span>
      {titulo}
    </p>
  );

  return (
    <div className="space-y-3">
      {/* Banners de casos especiais */}
      {temFerias && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-info/10 border border-info/30 text-info text-sm">
          <Palmtree className="w-4 h-4 shrink-0" />
          Funcionário em férias — o pagamento das férias é feito em recibo separado (a rubrica de compensação zera o valor já pago).
        </div>
      )}
      {temRescisao && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-info/10 border border-info/30 text-info text-sm">
          <FileX2 className="w-4 h-4 shrink-0" />
          Rescisão na competência — as verbas foram pagas no TRCT (a rubrica de compensação abate o total). Líquido R$ 0,00 é esperado.
        </div>
      )}

      {/* Fluxo: (+) PROVENTOS − (−) DESCONTOS = LÍQUIDO */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_minmax(190px,0.7fr)] gap-4">
        <div className="rounded-lg bg-card border border-border p-3">
          {colunaTitulo("+", "Proventos")}
          <div className="space-y-2.5">
            {GRUPOS_PROVENTO.map((g) => <RubricaGroup key={g} titulo={g} rubricas={linhasProvento(g)} />)}
            {proventos.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma rubrica de provento.</p>}
          </div>
          <div className="mt-2 pt-2 border-t border-border flex items-center justify-between gap-2 flex-wrap">
            <VerificacaoBadge label="Σ proventos = Total do PDF" esperado={det.totalProventos ?? null} valor={somaProventos} />
            <span className="text-sm font-bold tabular-nums ml-auto">Total {formatBRL(totalProventos)}</span>
          </div>
        </div>

        <div className="rounded-lg bg-card border border-border p-3">
          {colunaTitulo("−", "Descontos")}
          <div className="space-y-2.5">
            {GRUPOS_DESCONTO.map((g) => <RubricaGroup key={g} titulo={g} rubricas={linhasDesconto(g)} />)}
            {descontos.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma rubrica de desconto.</p>}
          </div>
          <div className="mt-2 pt-2 border-t border-border flex items-center justify-between gap-2 flex-wrap">
            <VerificacaoBadge label="Σ descontos = Total do PDF" esperado={det.totalDescontos ?? null} valor={somaDescontos} />
            <span className="text-sm font-bold tabular-nums ml-auto">Total {formatBRL(totalDescontos)}</span>
          </div>
        </div>

        <div className="rounded-lg bg-card border border-border p-3 flex flex-col">
          {colunaTitulo("=", "Líquido")}
          <p className="text-2xl font-bold tabular-nums text-foreground">{formatBRL(valores.liquido)}</p>
          <div className="mt-2">
            <VerificacaoBadge label="proventos − descontos" esperado={liquidoEsperado} valor={valores.liquido} />
          </div>
        </div>
      </div>

      {/* Bases de cálculo */}
      <div className="rounded-lg bg-card border border-border px-4 py-2.5 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Bases de cálculo</span>
          <span className="tabular-nums">Base INSS <span className="font-semibold">{det.baseInss != null ? formatBRL(det.baseInss) : "—"}</span></span>
          <span className="tabular-nums">Base FGTS <span className="font-semibold">{det.baseFgts != null ? formatBRL(det.baseFgts) : "—"}</span></span>
          <span className="tabular-nums">Base IRRF <span className="font-semibold">{det.baseIrrf != null ? formatBRL(det.baseIrrf) : "—"}</span></span>
          <VerificacaoBadge label="FGTS = 8% × base" esperado={fgtsEsperado} valor={valores.fgts} />
        </div>
        <p className={cn("flex items-start gap-1.5 text-xs text-muted-foreground")}>
          <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
          A base pode diferir do total de proventos: faltas e desconto de DSR reduzem a base; salário família não integra.
        </p>
      </div>

      {/* Encargos da empresa (fora do líquido) */}
      <EncargosPatronaisBar fgts={valores.fgts} inssPatronal={valores.inssPatronal} />
    </div>
  );
}
