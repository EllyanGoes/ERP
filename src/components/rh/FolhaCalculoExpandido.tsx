"use client";

import { useState } from "react";
import { cn, formatBRL } from "@/lib/utils";
import { calcularInssProgressivo, type FaixaInss } from "@/components/rh/InssConfigDialog";
import RubricaGroup, { type RubricaLinha } from "@/components/rh/RubricaGroup";
import VerificacaoBadge from "@/components/rh/VerificacaoBadge";
import EncargosPatronaisBar from "@/components/rh/EncargosPatronaisBar";
import { Info, Palmtree, FileX2, UserMinus, ChevronDown, ChevronRight } from "lucide-react";

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
const codN = (r: Rubrica) => parseInt(cod(r) || "-1", 10);

// ── Agrupamento pedagógico das rubricas (por CÓDIGO, com fallback textual) ──
const GRUPOS_PROVENTO = ["Salário", "Adicionais", "Horas extras + DSR", "Férias/13º/Rescisão", "Benefícios", "Outros proventos"] as const;
function grupoProvento(r: Rubrica): (typeof GRUPOS_PROVENTO)[number] {
  const c = codN(r);
  if ([43, 2206].includes(c)) return "Benefícios";
  if ([97, 35, 104].includes(c)) return "Salário";
  if ([61, 72, 73, 199, 241, 202, 2205].includes(c)) return "Adicionais";
  if ([13, 183, 6].includes(c)) return "Horas extras + DSR";
  if ([11, 20, 33, 37, 41, 48, 1001, 1002].includes(c)) return "Férias/13º/Rescisão";
  const d = norm(r.descricao);
  if (/SAL[ÁA]RIO\s*FAM/.test(d)) return "Benefícios";
  if (/F[ÉE]RIAS|13[ºO°]|RESCIS/.test(d)) return "Férias/13º/Rescisão";
  if (/HORA EXTRA|(^|\s)DSR($|\s)/.test(d)) return "Horas extras + DSR";
  if (/INSALUBRIDAD|PERICULOSIDADE|NOTURNO|ADICIONAL/.test(d)) return "Adicionais";
  if (/SAL[ÁA]RIO|VENCIMENTO|ORDENADO/.test(d)) return "Salário";
  return "Outros proventos";
}

const GRUPOS_DESCONTO = ["Tributos", "Ausências", "Antecipações", "Consignados / Outros", "Compensações", "Outros descontos"] as const;
function grupoDesconto(r: Rubrica): (typeof GRUPOS_DESCONTO)[number] {
  const c = codN(r);
  const d = norm(r.descricao);
  if ([998, 999, 1005].includes(c) || /RESCIS|COMPENSA/.test(d)) return "Compensações";
  if ([1074, 1075].includes(c) || /INSS|IRRF|IRF\b|IMPOSTO/.test(d)) return "Tributos";
  if ([84, 89, 100].includes(c) || /FALTA|DESCONTO DSR|ATRASO/.test(d)) return "Ausências";
  if (c === 181 || /ADIANTAMENTO/.test(d)) return "Antecipações";
  if ((c >= 9253 && c <= 9258) || [80, 83, 1041].includes(c) || /CONSIGNADO|EMPREST|VALE|PENS[ÃA]O/.test(d)) return "Consignados / Outros";
  return "Outros descontos";
}

// Referência formatada por semântica: parcela de consignado, alíquota do INSS,
// dias (salário/faltas/DSR) ou horas.
function fmtRef(r: Rubrica): string | undefined {
  const ref = (r.referencia ?? "").trim();
  if (!ref) return undefined;
  const par = ref.match(/^(?:\d+\.)?(\d+\/\d+)$/);
  if (par) return `parc. ${par[1]}`;
  const d = norm(r.descricao);
  if ([1074, 1075].includes(codN(r)) || /INSS/.test(d)) return `${ref.replace(/,00$/, "")}%`;
  if (/HORA/.test(d)) return `${ref}h`;
  if (/MES CIVIL|FALTAS DIAS|DESCONTO DSR/.test(d)) {
    const v = ref.replace(/,00$/, "");
    return `${v} dia${v === "1" ? "" : "s"}`;
  }
  return ref;
}

function linha(r: Rubrica, extra?: Partial<RubricaLinha>): RubricaLinha {
  return { codigo: r.codigo, descricao: r.descricao, referencia: fmtRef(r), valor: r.valor, ...extra };
}

// ── Conciliação das bases de cálculo ─────────────────────────────────────────
// A base OFICIAL é sempre a do PDF; aqui só estimamos a composição
// (proventos − não-integrantes − redutoras) e mostramos o resíduo com
// transparência quando não fecha — nunca sobrescrever nem "distribuir".
const NAO_INTEGRA_BASE = new Set([43, 2206, 998, 999, 1005, 1041]);
const REDUZ_BASE = new Set([84, 89, 100]);
const naoIntegraBase = (r: Rubrica) =>
  NAO_INTEGRA_BASE.has(codN(r)) || /SAL[ÁA]RIO\s*FAM|PENS[ÃA]O/.test(norm(r.descricao));
const reduzBase = (r: Rubrica) =>
  REDUZ_BASE.has(codN(r)) || /FALTAS|DESCONTO DSR/.test(norm(r.descricao));

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
  // Composição da base (extrato de conciliação) recolhida por padrão.
  const [verComposicao, setVerComposicao] = useState(false);
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
      linha(r, g === "Benefícios" ? { tag: "não integra base" } : undefined),
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
        return linha(r, { tag: "pago em recibo separado" });
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

      {/* Sem rubricas detalhadas (extração via parser): fluxo compacto só com
          totais — as conferências de base continuam valendo. */}
      {rubricas.length === 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="px-3 py-1.5 rounded-lg bg-card border border-border tabular-nums">
            <span className="text-muted-foreground">(+) Proventos</span> <span className="font-semibold">{formatBRL(totalProventos)}</span>
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-card border border-border tabular-nums">
            <span className="text-muted-foreground">(−) Descontos</span> <span className="font-semibold">{formatBRL(totalDescontos)}</span>
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-card border border-border tabular-nums">
            <span className="text-muted-foreground">(=) Líquido</span> <span className="font-semibold">{formatBRL(valores.liquido)}</span>
          </span>
          <VerificacaoBadge label="proventos − descontos" esperado={liquidoEsperado} valor={valores.liquido} />
          <span className="text-xs text-muted-foreground w-full">
            Rubricas detalhadas indisponíveis — extração feita sem IA (configure a ANTHROPIC_API_KEY e reextraia para ver o cálculo completo).
          </span>
        </div>
      )}

      {/* Fluxo: (+) PROVENTOS − (−) DESCONTOS = LÍQUIDO */}
      {rubricas.length > 0 && (
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
      )}

      {/* Bases de cálculo — compacta, com conciliação expansível */}
      {(() => {
        const basePdf = det.baseInss;
        const naoIntegrantes = proventos.filter(naoIntegraBase);
        const redutoras = descontos.filter(reduzBase);
        const somaNI = Math.round(naoIntegrantes.reduce((a, r) => a + r.valor, 0) * 100) / 100;
        const somaRed = Math.round(redutoras.reduce((a, r) => a + r.valor, 0) * 100) / 100;
        const estimada = Math.round((totalProventos - somaNI - somaRed) * 100) / 100;
        const residuo = basePdf != null ? Math.round((basePdf - estimada) * 100) / 100 : 0;
        const fecha = basePdf != null && Math.abs(residuo) <= 0.01;
        const igual = (a?: number | null, b?: number | null) => a != null && b != null && Math.abs(a - b) <= 0.01;
        const basesIguais = igual(det.baseInss, det.baseFgts) && igual(det.baseInss, det.baseIrrf);
        // Base INSS 0 é válida (pensão/afastamento parcial) — só informa, não concilia.
        const concilia = basePdf != null && basePdf > 0 && rubricas.length > 0;

        const extratoLinha = (label: React.ReactNode, valor: number, opts?: { negativo?: boolean; forte?: boolean }) => (
          <div className={cn("flex items-baseline gap-2 text-sm", opts?.forte && "font-semibold")}>
            <span className="min-w-0">{label}</span>
            <span className="flex-1 border-b border-dotted border-border/70 translate-y-[-3px]" />
            <span className="tabular-nums shrink-0">{opts?.negativo ? "− " : ""}{formatBRL(valor)}</span>
          </div>
        );
        const subLinhas = (rs: Rubrica[]) => rs.map((r, i) => (
          <div key={i} className="flex items-baseline gap-2 text-xs text-muted-foreground pl-4">
            <span className="min-w-0 truncate">{r.descricao}{fmtRef(r) ? ` (${fmtRef(r)})` : ""}</span>
            <span className="flex-1" />
            <span className="tabular-nums shrink-0">{formatBRL(r.valor)}</span>
          </div>
        ));

        return (
          <div className="rounded-lg bg-card border border-border px-4 py-2.5 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              <button
                onClick={() => setVerComposicao((v) => !v)}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground"
                title="Ver composição da base"
              >
                {verComposicao ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                Bases de cálculo
              </button>
              <span className="tabular-nums">Base INSS <span className="font-semibold">{det.baseInss != null ? formatBRL(det.baseInss) : "—"}</span></span>
              <span className="tabular-nums">Base FGTS <span className="font-semibold">{det.baseFgts != null ? formatBRL(det.baseFgts) : "—"}</span></span>
              <span className="tabular-nums">Base IRRF <span className="font-semibold">{det.baseIrrf != null ? formatBRL(det.baseIrrf) : "—"}</span></span>
              <VerificacaoBadge label="FGTS = 8% × base" esperado={fgtsEsperado} valor={valores.fgts} />
              {concilia && (
                <span className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium",
                  fecha ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
                )}>
                  {fecha ? "✓ conciliação fecha" : "⚠ conciliação parcial"}
                </span>
              )}
              <button
                onClick={() => setVerComposicao((v) => !v)}
                className="text-xs text-info hover:underline"
              >
                {verComposicao ? "ocultar composição" : "ver composição"}
              </button>
            </div>

            {verComposicao && (
              <div className="pt-1.5 border-t border-border/60 space-y-1.5 max-w-xl">
                {!basesIguais && (
                  <p className="text-xs text-muted-foreground">
                    As bases diferem neste funcionário — a conciliação abaixo é da <span className="font-medium">Base INSS</span>; FGTS e IRRF são informadas pelo PDF.
                  </p>
                )}
                {concilia ? (
                  <>
                    {extratoLinha("Total de proventos", totalProventos)}
                    {extratoLinha("− Rubricas que não integram a base", somaNI, { negativo: true })}
                    {subLinhas(naoIntegrantes)}
                    {extratoLinha("− Deduções da base (faltas/DSR)", somaRed, { negativo: true })}
                    {subLinhas(redutoras)}
                    {fecha ? (
                      extratoLinha(`= Base de cálculo${basesIguais ? " (INSS/FGTS/IRRF)" : " (INSS)"} — confere com o PDF ✓`, basePdf!, { forte: true })
                    ) : (
                      <>
                        {extratoLinha("= Base estimada", estimada, { forte: true })}
                        {extratoLinha("± Ajuste não identificado", Math.abs(residuo), { negativo: residuo < 0 })}
                        {extratoLinha(`= Base de cálculo${basesIguais ? " (INSS/FGTS/IRRF)" : " (INSS)"} — PDF`, basePdf!, { forte: true })}
                      </>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">Bases informadas pelo PDF — sem conciliação (base INSS zerada ou sem rubricas detalhadas).</p>
                )}
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                  A base pode diferir do total de proventos: faltas e desconto de DSR reduzem a base; salário família não integra. A base oficial é sempre a do PDF.
                </p>
              </div>
            )}
          </div>
        );
      })()}

      {/* Encargos da empresa (fora do líquido) */}
      <EncargosPatronaisBar fgts={valores.fgts} inssPatronal={valores.inssPatronal} />
    </div>
  );
}
