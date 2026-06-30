"use client";

import { formatCPFCNPJ } from "@/lib/utils";
import { labelCanal } from "@/components/marketing/ConcorrenteForm";
import { Users, Share2 } from "lucide-react";

type Contato = { id?: string; nome: string; cargo: string | null; telefone: string | null; email: string | null };
type Canal = { id?: string; tipo: string; valor: string | null; observacao: string | null };

type Concorrente = {
  tipoPessoa: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cpfCnpj: string | null;
  ehFornecedor: boolean;
  ehRevendedor: boolean;
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
  contatos?: Contato[];
  canais?: Canal[];
};

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
  const categoria = [c.ehFornecedor ? "Fornecedor" : null, c.ehRevendedor ? "Revendedor" : null]
    .filter(Boolean)
    .join(" e ") || "—";

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
        <Field label="E-mail" value={c.email} />
        <Field label="Site" value={c.site} />
        <Field label="Telefone" value={c.telefone} />
        <Field label="Celular" value={c.celular} />
      </div>

      {c.contatos && c.contatos.length > 0 && (
        <>
          <SectionTitle><span className="inline-flex items-center gap-2"><Users className="h-3.5 w-3.5" /> Contatos</span></SectionTitle>
          <div className="px-5 py-4 space-y-2">
            {c.contatos.map((ct, i) => (
              <div key={ct.id ?? i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm border-b border-border/60 last:border-0 pb-2 last:pb-0">
                <span className="font-medium text-foreground">{ct.nome}</span>
                {ct.cargo && <span className="text-xs text-muted-foreground">{ct.cargo}</span>}
                {ct.telefone && <span className="text-muted-foreground">{ct.telefone}</span>}
                {ct.email && <span className="text-muted-foreground">{ct.email}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {c.canais && c.canais.length > 0 && (
        <>
          <SectionTitle><span className="inline-flex items-center gap-2"><Share2 className="h-3.5 w-3.5" /> Canais de aquisição</span></SectionTitle>
          <div className="px-5 py-4 flex flex-wrap gap-2">
            {c.canais.map((cn, i) => (
              <span key={cn.id ?? i} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs">
                <span className="font-semibold text-foreground">{labelCanal(cn.tipo)}</span>
                {cn.valor && <span className="text-muted-foreground">· {cn.valor}</span>}
                {cn.observacao && <span className="text-muted-foreground/70">({cn.observacao})</span>}
              </span>
            ))}
          </div>
        </>
      )}

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
