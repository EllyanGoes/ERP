import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBRL(value: number | string): string {
  const num = typeof value === "string" ? parseFloat(value) : value
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(num)
}

export function formatCPFCNPJ(value: string): string {
  const digits = value.replace(/\D/g, "")
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
  }
  return digits
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2")
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "-"
  const d = new Date(date)
  if (isNaN(d.getTime())) return "-"
  // Date-only business fields (emissão, entrega, vencimento) are stored as UTC
  // midnight. Format in UTC so the displayed day matches what was entered,
  // regardless of the viewer's timezone (avoids the off-by-one-day shift).
  const dd = String(d.getUTCDate()).padStart(2, "0")
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  const yyyy = d.getUTCFullYear()
  return `${dd}/${mm}/${yyyy}`
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "-"
  return format(new Date(date), "dd/MM/yyyy HH:mm", { locale: ptBR })
}

export function generateDocNumber(prefix: string, seq: number): string {
  const year = new Date().getFullYear()
  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`
}

/** Generates a simple sequential number without year, e.g. "SC-0001" */
export function generateSimpleDocNumber(prefix: string, seq: number): string {
  return `${prefix}-${String(seq).padStart(4, "0")}`
}

export function getStatusContaColor(status: string): string {
  switch (status) {
    case "ABERTA": return "blue"
    case "PAGA": return "green"
    case "VENCIDA": return "red"
    case "CANCELADA": return "gray"
    case "PARCIAL": return "amber"
    default: return "gray"
  }
}

export function getStatusPedidoColor(status: string): string {
  switch (status) {
    case "ORCAMENTO": return "gray"
    case "CONFIRMADO": return "blue"
    case "EM_AGENDAMENTO": return "violet"
    case "CONCLUIDO": return "green"
    case "CANCELADO": return "red"
    default: return "gray"
  }
}

export function isVencida(dataVencimento: Date | string, dataPagamento?: Date | string | null): boolean {
  if (dataPagamento) return false
  return new Date(dataVencimento) < new Date()
}

export function decimalToNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  return parseFloat(String(value))
}
