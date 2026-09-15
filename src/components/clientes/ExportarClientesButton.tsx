"use client";

// Baixa em planilha (.xlsx) todos os dados cadastrados dos clientes, com as
// colunas na ordem da ficha. Gera no navegador — nada passa pelo servidor.
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { formatCPFCNPJ } from "@/lib/utils";

export type ClienteExport = {
  razaoSocial: string;
  nomeFantasia: string | null;
  tipoPessoa: string;
  cpfCnpj: string | null;
  ie: string | null;
  indIE: number;
  suframa: string | null;
  email: string | null;
  telefone: string | null;
  celular: string | null;
  status: string;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  codigoMunicipioIBGE: string | null;
  latitude: number | null;
  longitude: number | null;
  observacoes: string | null;
  mapeado: boolean;
  createdAt: string;
  updatedAt: string;
};

const IND_IE: Record<number, string> = { 1: "Contribuinte", 2: "Isento", 9: "Não contribuinte" };
const STATUS: Record<string, string> = { ATIVO: "Ativo", INATIVO: "Inativo", PROSPECTO: "Prospecto" };
const dataBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

export default function ExportarClientesButton({ clientes }: { clientes: ClienteExport[] }) {
  function exportar() {
    const linhas = clientes.map((c) => ({
      "Razão Social / Nome": c.razaoSocial,
      "Nome Fantasia": c.nomeFantasia ?? "",
      "Tipo": c.tipoPessoa === "FISICA" ? "PF" : "PJ",
      "CPF/CNPJ": c.cpfCnpj ? formatCPFCNPJ(c.cpfCnpj) : "",
      "Inscrição Estadual": c.ie ?? "",
      "Indicador IE": IND_IE[c.indIE] ?? String(c.indIE),
      "SUFRAMA": c.suframa ?? "",
      "E-mail": c.email ?? "",
      "Telefone": c.telefone ?? "",
      "Celular": c.celular ?? "",
      "Status": STATUS[c.status] ?? c.status,
      "CEP": c.cep ?? "",
      "Logradouro": c.logradouro ?? "",
      "Número": c.numero ?? "",
      "Complemento": c.complemento ?? "",
      "Bairro": c.bairro ?? "",
      "Cidade": c.cidade ?? "",
      "UF": c.estado ?? "",
      "Cód. IBGE": c.codigoMunicipioIBGE ?? "",
      "Latitude": c.latitude ?? "",
      "Longitude": c.longitude ?? "",
      "Mapeado na IC": c.mapeado ? "Sim" : "Não",
      "Observações": c.observacoes ?? "",
      "Cadastrado em": dataBR(c.createdAt),
      "Atualizado em": dataBR(c.updatedAt),
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    // Largura das colunas pelo maior conteúdo (limitada p/ não virar uma faixa).
    const chaves = Object.keys(linhas[0] ?? {});
    ws["!cols"] = chaves.map((k) => ({ wch: Math.min(50, Math.max(k.length, ...linhas.map((l) => String(l[k as keyof typeof l] ?? "").length)) + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clientes");
    const hoje = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `clientes-${hoje}.xlsx`);
  }

  return (
    <Button variant="outline" onClick={exportar} disabled={clientes.length === 0} title="Baixar todos os clientes em planilha Excel">
      <Download className="w-4 h-4 mr-2" />
      Baixar planilha
    </Button>
  );
}
