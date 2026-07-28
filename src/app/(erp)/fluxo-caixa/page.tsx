"use client";

// Fluxo de Caixa — só o RELATÓRIO ANUAL (estilo DRE por natureza × mês, com
// drill-down por título). A projeção diária foi removida a pedido do dono
// (jul/2026). Sem PageHeader (padrão da tela de Contas a Pagar): a planilha
// ganha a tela inteira, com o seletor de ano e o download na barra superior.
import RelatorioAnual from "@/components/fluxo-caixa/RelatorioAnual";

export default function FluxoCaixaPage() {
  return (
    <div className="px-8 pt-4 pb-8">
      <RelatorioAnual />
    </div>
  );
}
