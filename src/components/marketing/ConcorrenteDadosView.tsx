"use client";

import { formatCPFCNPJ } from "@/lib/utils";

type Canal = { id?: string; tipo: string; valor: string | null };

type Concorrente = {
  tipoPessoa: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cpfCnpj: string | null;
  ehFornecedor: boolean;
  ehRevendedor: boolean;
  ehConstrutora?: boolean;
  ehConsumidorFinal?: boolean;
  ativo: boolean;
  email: string | null;
  telefone: string | null;
  celular: string | null;
  site: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  observacoes: string | null;
  canais?: Canal[];
};

// O contato principal é derivado dos canais: pega o 1º valor de cada tipo.
function valorCanal(canais: Canal[] | undefined, tipos: string[]): string | null {
  for (const t of tipos) {
    const c = canais?.find((x) => x.tipo === t && x.valor);
    if (c?.valor) return c.valor;
  }
  return null;
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-foreground break-words">{value || "—"}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 py-3 border-t border-b border-border bg-muted first:border-t-0">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{children}</p>
    </div>
  );
}

export default function ConcorrenteDadosView({ c }: { c: Concorrente }) {
  const categoria = [
    c.ehFornecedor ? "Fornecedor" : null,
    c.ehRevendedor ? "Revendedor" : null,
    c.ehConstrutora ? "Construtora" : null,
    c.ehConsumidorFinal ? "Consumidor final" : null,
  ].filter(Boolean).join(" · ") || "—";

  const endereco = [
    c.logradouro,
    c.numero ? `nº ${c.numero}` : null,
    c.complemento,
    c.bairro,
    [c.cidade, c.estado].filter(Boolean).join("/"),
    c.cep,
  ].filter(Boolean).join(", ");

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden max-w-3xl">
      <SectionTitle>Identificação</SectionTitle>
      <div className="px-5 py-5 grid grid-cols-2 gap-x-8 gap-y-5">
        <Field label="Tipo de Pessoa" value={c.tipoPessoa === "JURIDICA" ? "Pessoa Jurídica" : "Pessoa Física"} />
        <Field label={c.tipoPessoa === "FISICA" ? "CPF" : "CNPJ"} value={formatCPFCNPJ(c.cpfCnpj)} />
        <Field label="Razão Social" value={c.razaoSocial} />
        <Field label="Nome Fantasia" value={c.nomeFantasia} />
        <Field label="Categoria" value={categoria} />
        <Field label="Status" value={c.ativo ? "Ativo" : "Inativo"} />
      </div>

      <SectionTitle>Contato principal</SectionTitle>
      <div className="px-5 py-5 grid grid-cols-2 gap-x-8 gap-y-5">
        <Field label="E-mail" value={valorCanal(c.canais, ["EMAIL"]) ?? c.email} />
        <Field label="Site" value={valorCanal(c.canais, ["SITE"]) ?? c.site} />
        <Field label="Telefone" value={valorCanal(c.canais, ["TELEFONE", "WHATSAPP"]) ?? c.telefone} />
        <Field label="Celular" value={valorCanal(c.canais, ["WHATSAPP"]) ?? c.celular} />
      </div>
      <p className="px-5 -mt-2 pb-3 text-[11px] text-muted-foreground">Derivado dos canais (aba Canais). Cadastre WhatsApp, e-mail, site etc. lá.</p>

      <SectionTitle>Endereço</SectionTitle>
      <div className="px-5 py-5 grid grid-cols-2 gap-x-8 gap-y-5">
        <div className="col-span-2">
          <Field label="Endereço completo" value={endereco || null} />
        </div>
        <Field label="CEP" value={c.cep} />
        <Field label="Cidade / Estado" value={[c.cidade, c.estado].filter(Boolean).join(" / ") || null} />
      </div>

      {c.observacoes && (
        <>
          <SectionTitle>Observações</SectionTitle>
          <div className="px-5 py-5">
            <p className="text-sm text-foreground whitespace-pre-wrap">{c.observacoes}</p>
          </div>
        </>
      )}
    </div>
  );
}
