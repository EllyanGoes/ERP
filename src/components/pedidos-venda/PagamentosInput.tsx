"use client";

// Lista de formas de pagamento (pagamento misto): cada linha tem forma, conta
// de destino e valor. Usado no Caixa e na Venda Balcão. A forma "dinheiro"
// (tipo DINHEIRO do cadastro) libera troco quando a soma excede o total.
// Cartão (crédito/débito) com `usarMaquinetas`: o operador escolhe a MAQUINETA
// no lugar da conta — a conta efetiva é a da administradora (derivada no back)
// e o líquido (valor − taxa) é exibido ao lado.
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { cn, formatBRL } from "@/lib/utils";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";

export type FormaOpt = { id: string; nome: string; tipo?: string; ativo?: boolean };
export type ContaOpt = { id: string; nome: string; tipo?: string; ativo?: boolean; ehTerceiro?: boolean; compensacao?: boolean };
export type MaquinetaOpt = {
  id: string;
  nome: string;
  administradora: { id: string; nome: string; contaBancariaId: string };
  taxas: { tipoForma: string; taxaPct: number; diasCompensacao: number }[];
};

/**
 * Conta de destino padrão para dinheiro: o "Caixa em Dinheiro" (tipo CAIXA) da
 * empresa ativa, vindo da lista de contas já escopada. Cai em "caixa-geral" só
 * se a empresa ainda não tiver um caixa cadastrado (a API resolve do mesmo
 * jeito no back). Evita o antigo default fixo que mandava tudo pro caixa da
 * Tramontin.
 */
export function contaCaixaPadrao(contas: ContaOpt[]): string {
  const ativas = contas.filter((c) => c.ativo !== false);
  return ativas.find((c) => c.tipo === "CAIXA")?.id ?? "caixa-geral";
}

export type LinhaPagamento = {
  _key: string;
  forma: string;
  contaBancariaId: string;
  valor: string; // texto do input
  maquinetaId?: string; // linha de cartão (crédito/débito): maquineta escolhida
};

export function novaLinhaPagamento(forma = "", contaBancariaId = "caixa-geral", valor = ""): LinhaPagamento {
  return { _key: crypto.randomUUID(), forma, contaBancariaId, valor };
}

export function parseValorBR(s: string): number {
  const n = parseFloat(String(s).replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

/** É forma em dinheiro? (libera troco) */
export function formaEhDinheiro(nome: string, formas: FormaOpt[]): boolean {
  const f = formas.find((x) => x.nome === nome);
  if (f?.tipo) return f.tipo === "DINHEIRO";
  return /dinheiro|espécie|especie/i.test(nome);
}

/** Tipo cadastrado da forma (CARTAO_CREDITO, PIX, ...) ou null. */
export function tipoDaForma(nome: string, formas: FormaOpt[]): string | null {
  return formas.find((x) => x.nome === nome)?.tipo ?? null;
}

/** É forma de cartão (crédito/débito)? Decide pelo TIPO do cadastro. */
export function formaEhCartao(nome: string, formas: FormaOpt[]): boolean {
  const tipo = tipoDaForma(nome, formas);
  return tipo === "CARTAO_CREDITO" || tipo === "CARTAO_DEBITO";
}

/** É PERMUTA? Não é forma de baixa unilateral — a quitação por bens/serviços
 *  acontece pelo Encontro de Contas (motivo Permuta). Aqui só serve para
 *  esconder a forma dos fluxos de pagamento e sinalizar títulos previstos. */
export function formaEhPermuta(nome: string, formas: FormaOpt[]): boolean {
  return tipoDaForma(nome, formas) === "PERMUTA";
}

/** Taxa % da maquineta para o tipo da forma (null se não cadastrada). */
export function taxaMaquinetaPct(m: MaquinetaOpt | undefined, forma: string, formas: FormaOpt[]): number | null {
  const tipo = tipoDaForma(forma, formas);
  const t = m?.taxas.find((x) => x.tipoForma === tipo);
  return t ? Number(t.taxaPct) : null;
}

// ── Maquinetas ativas da empresa (GET /api/financeiro/cartoes/opcoes) ────────
// Cache de módulo com TTL curto: várias instâncias do componente (PDV + modais)
// compartilham a mesma busca sem refazer o fetch a cada render; o TTL cobre a
// troca de empresa ativa e cadastros novos.
let maquinetasCache: { promessa: Promise<MaquinetaOpt[]>; ate: number } | null = null;
export function fetchMaquinetas(): Promise<MaquinetaOpt[]> {
  const agora = Date.now();
  if (!maquinetasCache || maquinetasCache.ate < agora) {
    const promessa = fetch("/api/financeiro/cartoes/opcoes")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => (Array.isArray(j?.data) ? (j.data as MaquinetaOpt[]) : []))
      .catch(() => {
        maquinetasCache = null; // falha não fica cacheada
        return [] as MaquinetaOpt[];
      });
    maquinetasCache = { promessa, ate: agora + 30_000 };
  }
  return maquinetasCache.promessa;
}

/** É conta do tipo Caixa (dinheiro físico)? Inclui o "caixa-geral" legado.
 *  Conta de TERCEIROS é isenta da trava (o terceiro pode usar várias contas). */
export function contaEhCaixa(contaId: string, contas: ContaOpt[]): boolean {
  if (!contaId) return false;
  if (contaId === "caixa-geral") return true;
  return contas.some((c) => c.id === contaId && c.tipo === "CAIXA" && !c.ehTerceiro);
}

/** A empresa tem alguma conta bancária (não-Caixa) cadastrada? A transitória
 *  de compensação não conta — não é banco de verdade. */
export function temContaBanco(contas: ContaOpt[]): boolean {
  return contas.some((c) => c.ativo !== false && c.tipo !== "CAIXA" && c.id !== "caixa-geral" && !c.compensacao);
}

/**
 * Conta de destino sugerida para a forma: dinheiro cai no Caixa; formas
 * eletrônicas (Pix, cartão, transferência…) NÃO recebem default quando há banco
 * cadastrado — o caixa escolhe o banco, senão o eletrônico iria parar no Caixa.
 * Sem nenhum banco cadastrado, cai no Caixa (única conta disponível).
 */
export function contaPadraoParaForma(forma: string, formas: FormaOpt[], contas: ContaOpt[]): string {
  if (formaEhDinheiro(forma, formas)) return contaCaixaPadrao(contas);
  return temContaBanco(contas) ? "" : contaCaixaPadrao(contas);
}

/**
 * Bloqueio de roteamento: retorna a primeira linha (valor > 0) cuja forma NÃO é
 * dinheiro mas a conta está vazia ou aponta para o Caixa — o que mandaria o
 * dinheiro eletrônico para o caixa físico. Só vale quando a empresa TEM banco
 * cadastrado (sem banco, o Caixa é a única opção). null = tudo certo.
 */
export function pagamentoContaInvalida(linhas: LinhaPagamento[], formas: FormaOpt[], contas: ContaOpt[]): LinhaPagamento | null {
  if (!temContaBanco(contas)) return null;
  return linhas.find((l) =>
    parseValorBR(l.valor) > 0 &&
    !formaEhDinheiro(l.forma, formas) &&
    // Cartão com maquineta: a conta é DERIVADA (administradora) — isenta da trava.
    !(formaEhCartao(l.forma, formas) && l.maquinetaId) &&
    (!l.contaBancariaId || contaEhCaixa(l.contaBancariaId, contas))
  ) ?? null;
}

/**
 * Bloqueio do cartão sem maquineta (modo `usarMaquinetas`): retorna a primeira
 * linha de cartão (valor > 0) sem maquineta escolhida — a venda no cartão
 * exige a maquineta (a conta e a taxa derivam dela). null = tudo certo.
 */
export function pagamentoCartaoSemMaquineta(linhas: LinhaPagamento[], formas: FormaOpt[]): LinhaPagamento | null {
  return linhas.find((l) => parseValorBR(l.valor) > 0 && formaEhCartao(l.forma, formas) && !l.maquinetaId) ?? null;
}

export default function PagamentosInput({
  linhas, setLinhas, formas, contas, total, mostrarConta = true, menuMinWidth, usarMaquinetas = false,
  contaPlaceholder = "Conta de destino",
}: {
  linhas: LinhaPagamento[];
  setLinhas: (fn: (prev: LinhaPagamento[]) => LinhaPagamento[]) => void;
  formas: FormaOpt[];
  contas: ContaOpt[];
  total: number;
  mostrarConta?: boolean; // no pedido de venda não há conta (intenção) → esconde
  menuMinWidth?: number; // largura mínima dos dropdowns de forma/conta
  // Venda com cartão = troca de credor: forma CARTAO_* escolhe a MAQUINETA no
  // lugar da conta (a conta efetiva é a da administradora, derivada no back).
  // Só ligar em fluxos cuja API aceita `maquinetaId` (PDV / venda balcão).
  usarMaquinetas?: boolean;
  // Rótulo da conta conforme o lado: recebimento = "Conta de destino" (default);
  // pagamento (contas a pagar) = "Conta de pagamento" (o dinheiro SAI dela).
  contaPlaceholder?: string;
}) {
  const pago = linhas.reduce((s, l) => s + parseValorBR(l.valor), 0);
  const temDinheiro = linhas.some((l) => parseValorBR(l.valor) > 0 && formaEhDinheiro(l.forma, formas));
  const falta = Math.max(total - pago, 0);
  const excesso = Math.max(pago - total, 0);
  const trocoValido = excesso > 0 && temDinheiro;

  // Maquinetas ativas da empresa (cache de módulo — 1 fetch por 30s entre
  // todas as instâncias). null = ainda carregando.
  const [maquinetas, setMaquinetas] = useState<MaquinetaOpt[] | null>(null);
  useEffect(() => {
    if (!usarMaquinetas) return;
    let vivo = true;
    fetchMaquinetas().then((ms) => { if (vivo) setMaquinetas(ms); });
    return () => { vivo = false; };
  }, [usarMaquinetas]);

  function up(key: string, campo: keyof LinhaPagamento, valor: string) {
    setLinhas((prev) => prev.map((l) => l._key === key ? { ...l, [campo]: valor } : l));
  }
  // Ao trocar a forma, a conta de destino segue a forma: dinheiro → Caixa;
  // eletrônica → limpa o Caixa (força escolher o banco), mas preserva um banco
  // já selecionado para não atrapalhar quem alterna entre formas eletrônicas.
  // Cartão (modo maquinetas) → limpa a conta e sugere a única maquineta.
  function changeForma(key: string, novaForma: string) {
    setLinhas((prev) => prev.map((l) => {
      if (l._key !== key) return l;
      const cartao = usarMaquinetas && formaEhCartao(novaForma, formas);
      let conta = l.contaBancariaId;
      if (cartao) conta = ""; // conta derivada da administradora (no back)
      else if (formaEhDinheiro(novaForma, formas)) conta = contaCaixaPadrao(contas);
      else if (contaEhCaixa(l.contaBancariaId, contas)) conta = temContaBanco(contas) ? "" : l.contaBancariaId;
      const maquinetaId = cartao
        ? (l.maquinetaId ?? (maquinetas?.length === 1 ? maquinetas[0].id : undefined))
        : undefined;
      return { ...l, forma: novaForma, contaBancariaId: conta, maquinetaId };
    }));
  }
  function add() {
    // nova linha já sugere o que falta como valor; conta = caixa da empresa
    setLinhas((prev) => [...prev, novaLinhaPagamento("", contaCaixaPadrao(contas), falta > 0 ? String(falta.toFixed(2)).replace(".", ",") : "")]);
  }
  function rm(key: string) {
    setLinhas((prev) => prev.length > 1 ? prev.filter((l) => l._key !== key) : prev);
  }

  // A transitória de compensação nunca é escolhida à mão.
  const contasOpts = contas.filter((c) => c.ativo !== false && !c.compensacao);
  // Só oferece o "Caixa Geral" legado se a empresa não tiver nenhum caixa.
  const temCaixa = contasOpts.some((c) => c.tipo === "CAIXA" || c.id === "caixa-geral");
  // Permuta NUNCA aparece como forma de pagamento — é quitada pelo Encontro de
  // Contas (motivo Permuta), não como baixa/recebimento unilateral.
  const formasOpts = formas.filter((f) => f.ativo !== false && f.tipo !== "PERMUTA");

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pagamento</span>
        <button type="button" onClick={add} className="inline-flex items-center gap-1 text-xs text-info hover:text-info font-medium">
          <Plus className="w-3.5 h-3.5" /> Forma
        </button>
      </div>

      {linhas.map((l) => {
        const cartao = usarMaquinetas && formaEhCartao(l.forma, formas);
        const maq = cartao ? maquinetas?.find((m) => m.id === l.maquinetaId) : undefined;
        const pct = cartao ? taxaMaquinetaPct(maq, l.forma, formas) : null;
        const valorNum = parseValorBR(l.valor);
        const liquido = pct != null ? Math.round((valorNum - (valorNum * pct) / 100) * 100) / 100 : null;
        const semMaquineta = cartao && maquinetas != null && maquinetas.length === 0;
        return (
        <div key={l._key}>
        <div className={cn("grid gap-2 items-center", mostrarConta ? "grid-cols-[1fr_1fr_5rem_auto]" : "grid-cols-[1fr_5rem_auto]")}>
          <div className="min-w-0">
            <ComboboxWithCreate
              value={l.forma}
              onChange={(v) => changeForma(l._key, v)}
              placeholder="— Forma —"
              noneLabel="Forma"
              menuMinWidth={menuMinWidth}
              triggerClassName="h-9 rounded-lg w-full min-w-0"
              options={[
                ...formasOpts.map((f) => ({ value: f.nome, label: f.nome })),
                // preserva a forma já escolhida que não está mais na lista ativa
                ...(l.forma && !formasOpts.some((f) => f.nome === l.forma) ? [{ value: l.forma, label: l.forma }] : []),
              ]}
            />
          </div>
          {mostrarConta && cartao ? (
            // Cartão: escolhe a MAQUINETA (a conta efetiva é a da administradora,
            // derivada no back; a taxa vem da TaxaMaquineta do tipo da forma).
            <ComboboxWithCreate
              value={l.maquinetaId ?? ""}
              onChange={(v) => up(l._key, "maquinetaId", v)}
              allowNone={false}
              placeholder="— Maquineta —"
              menuMinWidth={menuMinWidth}
              triggerClassName={cn("h-9 rounded-lg", valorNum > 0 && !l.maquinetaId && "border-red-400 bg-danger/10 text-danger")}
              options={(maquinetas ?? []).map((m) => ({ value: m.id, label: m.nome }))}
            />
          ) : mostrarConta ? (() => {
            // Forma eletrônica sem banco (ou apontando para o Caixa) = roteamento
            // errado: destaca em vermelho e exige a escolha do banco.
            const invalida = temContaBanco(contas) && parseValorBR(l.valor) > 0 && !formaEhDinheiro(l.forma, formas) && (!l.contaBancariaId || contaEhCaixa(l.contaBancariaId, contas));
            return (
              <ComboboxWithCreate
                value={l.contaBancariaId}
                onChange={(v) => up(l._key, "contaBancariaId", v)}
                allowNone={false}
                placeholder={contaPlaceholder}
                menuMinWidth={menuMinWidth}
                triggerClassName={cn("h-9 rounded-lg", invalida && "border-red-400 bg-danger/10 text-danger")}
                options={[
                  ...(!temCaixa ? [{ value: "caixa-geral", label: "Caixa Geral" }] : []),
                  ...contasOpts.map((c) => ({ value: c.id, label: c.nome })),
                ]}
              />
            );
          })() : null}
          <input
            value={l.valor}
            onChange={(e) => up(l._key, "valor", e.target.value)}
            placeholder="0,00"
            className="h-9 w-full min-w-0 rounded-lg border border-border px-2 text-sm text-right font-mono bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => rm(l._key)}
            disabled={linhas.length <= 1}
            className="p-1.5 rounded text-muted-foreground/60 hover:text-red-500 hover:bg-danger/10 disabled:opacity-30 disabled:hover:bg-transparent"
            title="Remover forma"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        {semMaquineta ? (
          <p className="mt-1 text-[11px] text-danger">
            Nenhuma maquineta ativa — cadastre em <span className="font-semibold">Financeiro → Cartões</span> para receber no cartão.
          </p>
        ) : cartao && liquido != null && valorNum > 0 && maq ? (
          <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
            {formatBRL(liquido)} líq. − {pct!.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% {maq.administradora?.nome || maq.nome}
          </p>
        ) : cartao && l.maquinetaId && pct == null && maquinetas != null ? (
          <p className="mt-1 text-[11px] text-danger">
            A maquineta não tem taxa cadastrada para esta forma — cadastre em <span className="font-semibold">Financeiro → Cartões</span>.
          </p>
        ) : null}
        </div>
        );
      })}

      <div className="flex items-center justify-between text-sm pt-1">
        <span className="text-muted-foreground">Pago: <span className="font-semibold text-foreground tabular-nums">{formatBRL(pago)}</span></span>
        {falta > 0.001 ? (
          <span className="font-bold text-danger tabular-nums">Falta {formatBRL(falta)}</span>
        ) : trocoValido ? (
          <span className="font-bold text-warning tabular-nums">Troco {formatBRL(excesso)}</span>
        ) : excesso > 0.001 ? (
          <span className="font-bold text-danger tabular-nums">Excesso sem dinheiro {formatBRL(excesso)}</span>
        ) : (
          <span className="font-bold text-success">Pagamento fecha ✓</span>
        )}
      </div>
    </div>
  );
}

/** Monta o payload `pagamentos` para a API a partir das linhas.
 *  Linha de cartão com maquineta: envia `maquinetaId` e NÃO envia conta —
 *  a conta efetiva (administradora) é derivada no back. */
export function pagamentosPayload(linhas: LinhaPagamento[], formas: FormaOpt[]) {
  return linhas
    .filter((l) => l.forma && parseValorBR(l.valor) > 0)
    .map((l) => {
      const comMaquineta = !!l.maquinetaId && formaEhCartao(l.forma, formas);
      return {
        forma: l.forma,
        contaBancariaId: comMaquineta ? null : (l.contaBancariaId || "caixa-geral"),
        valor: parseValorBR(l.valor),
        troco: formaEhDinheiro(l.forma, formas),
        ...(comMaquineta ? { maquinetaId: l.maquinetaId } : {}),
      };
    });
}

/** Validação client: soma cobre o total, troco só com dinheiro e — no modo
 *  maquinetas — toda linha de cartão com valor tem maquineta escolhida. */
export function pagamentosValidos(linhas: LinhaPagamento[], formas: FormaOpt[], total: number, usarMaquinetas = false): boolean {
  if (usarMaquinetas && pagamentoCartaoSemMaquineta(linhas, formas)) return false;
  if (total <= 0) return true;
  const pago = linhas.reduce((s, l) => s + parseValorBR(l.valor), 0);
  if (pago < total - 0.001) return false;
  const excesso = pago - total;
  if (excesso > 0.001) {
    const temDinheiro = linhas.some((l) => parseValorBR(l.valor) > 0 && formaEhDinheiro(l.forma, formas));
    const totalDinheiro = linhas.filter((l) => formaEhDinheiro(l.forma, formas)).reduce((s, l) => s + parseValorBR(l.valor), 0);
    if (!temDinheiro || excesso > totalDinheiro + 0.001) return false;
  }
  return true;
}
