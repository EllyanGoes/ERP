// Gera os bytes ESC/POS de uma minuta para impressora térmica (bobina).
// Enviado ao aparelho via WebUSB (ver webusb-print.ts). Padrão 80mm (48 colunas);
// para 58mm use cols = 32. Acentos são removidos para evitar caractere quebrado
// em impressoras com code page diferente.

export type MinutaPrint = {
  numero: string;
  numeroFisico?: string | null;
  tipo?: string | null;
  dataEmissao?: string | null;
  dataEntrega?: string | null;
  motorista?: { nome: string } | null;
  placa?: string | null;
  observacoes?: string | null;
  pedidoVenda: {
    numero: string;
    cliente: { razaoSocial: string; nomeFantasia: string | null };
    // Venda à ordem: destinatário (cliente final). Quando presente, o `cliente`
    // é o adquirente e este é quem recebe fisicamente a mercadoria.
    clienteFinal?: { razaoSocial: string; nomeFantasia: string | null } | null;
  };
  itens: Array<{
    item: { codigo: string; descricao: string };
    quantidade: string | number;
    quantidadeConvertida?: string | number | null;
    unidade?: { sigla: string } | null;
  }>;
};

export type EscPosOptions = {
  cols?: number;        // colunas da bobina (80mm ≈ 48, 58mm ≈ 32)
  empresa?: string;     // cabeçalho opcional (nome da empresa)
  cut?: boolean;        // corte automático no fim (default true)
};

// ── comandos ESC/POS ────────────────────────────────────────────────────────
const ESC = 0x1b, GS = 0x1d;
const INIT = [ESC, 0x40];
const ALIGN_L = [ESC, 0x61, 0x00], ALIGN_C = [ESC, 0x61, 0x01];
const BOLD_ON = [ESC, 0x45, 0x01], BOLD_OFF = [ESC, 0x45, 0x00];
const SIZE_NORMAL = [GS, 0x21, 0x00], SIZE_DH = [GS, 0x21, 0x01]; // altura dupla
const feed = (n: number) => [ESC, 0x64, n];
const CUT = [GS, 0x56, 0x42, 0x00]; // corte parcial com avanço

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "");
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function fmtQty(n: string | number | null | undefined): string {
  const v = parseFloat(String(n ?? 0));
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

export function buildMinutaEscPos(minuta: MinutaPrint, opts: EscPosOptions = {}): Uint8Array {
  const cols = opts.cols ?? 48;
  const cut = opts.cut ?? true;
  const bytes: number[] = [];
  const enc = new TextEncoder();

  const raw = (arr: number[]) => bytes.push(...arr);
  const line = (s = "") => {
    const e = enc.encode(stripAccents(s));
    for (let i = 0; i < e.length; i++) bytes.push(e[i]);
    bytes.push(0x0a);
  };
  const sep = (ch = "-") => line(ch.repeat(cols));
  // duas colunas: rótulo à esquerda, valor à direita, na mesma linha
  const lr = (left: string, right: string) => {
    const l = stripAccents(left), r = stripAccents(right);
    const space = Math.max(1, cols - l.length - r.length);
    line(l + " ".repeat(space) + r);
  };

  raw(INIT);

  // Cabeçalho
  raw(ALIGN_C);
  if (opts.empresa) { raw(BOLD_ON); line(opts.empresa); raw(BOLD_OFF); }
  raw(BOLD_ON); raw(SIZE_DH);
  line(`MINUTA ${minuta.numero}`);
  raw(SIZE_NORMAL); raw(BOLD_OFF);
  if (minuta.tipo) line(minuta.tipo === "RETIRADA" ? "Retirada" : "Entrega");
  raw(ALIGN_L);
  sep();

  if (minuta.numeroFisico) lr("Minuta fisica:", minuta.numeroFisico);
  lr("Pedido:", minuta.pedidoVenda.numero);
  lr("Emissao:", fmtDate(minuta.dataEmissao));
  lr(minuta.tipo === "RETIRADA" ? "Retirada:" : "Entrega:", fmtDate(minuta.dataEntrega));
  sep();

  // Cliente — venda à ordem mostra adquirente + destinatário; senão, só o cliente.
  const cli = minuta.pedidoVenda.cliente;
  const dest = minuta.pedidoVenda.clienteFinal;
  if (dest) {
    raw(BOLD_ON); line("ADQUIRENTE"); raw(BOLD_OFF);
    line(cli.nomeFantasia || cli.razaoSocial);
    raw(BOLD_ON); line("DESTINATARIO"); raw(BOLD_OFF);
    line(dest.nomeFantasia || dest.razaoSocial);
  } else {
    raw(BOLD_ON); line("CLIENTE"); raw(BOLD_OFF);
    line(cli.nomeFantasia || cli.razaoSocial);
  }
  sep();

  // Itens
  raw(BOLD_ON); line("ITENS"); raw(BOLD_OFF);
  for (const it of minuta.itens) {
    line(it.item.descricao);
    const un = it.unidade?.sigla ?? "UN";
    const qtd = it.quantidadeConvertida != null ? it.quantidadeConvertida : it.quantidade;
    lr(`  ${it.item.codigo}`, `${fmtQty(qtd)} ${un}`);
  }
  sep();

  // Logistica
  if (minuta.motorista?.nome) lr("Motorista:", minuta.motorista.nome);
  if (minuta.placa) lr("Placa:", minuta.placa);
  if (minuta.observacoes) { line("Obs:"); line(minuta.observacoes); }

  // Assinatura
  raw(feed(2));
  line("Recebido por:");
  line("____________________________________".slice(0, cols));

  raw(feed(3));
  if (cut) raw(CUT);

  return new Uint8Array(bytes);
}
