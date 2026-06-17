// Cliente (browser) do lookup de parceiro por CPF/CNPJ. Ver
// src/app/api/parceiros/lookup/route.ts.

export type ParceiroLookup = {
  id: string;
  tipoPessoa: string | null;
  razaoSocial: string;
  nomeFantasia: string | null;
  cpfCnpj: string | null;
  ie: string | null;
  email: string | null;
  telefone: string | null;
  celular: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
};

export type ParceiroLookupResult = {
  cliente: ParceiroLookup | null;
  fornecedor: ParceiroLookup | null;
};

const VAZIO: ParceiroLookupResult = { cliente: null, fornecedor: null };

export async function lookupParceiro(
  cpfCnpj: string,
  opts?: { ignoreClienteId?: string; ignoreFornecedorId?: string },
): Promise<ParceiroLookupResult> {
  const digits = (cpfCnpj ?? "").replace(/\D/g, "");
  if (digits.length < 11) return VAZIO;
  const qs = new URLSearchParams({ cpfCnpj: digits });
  if (opts?.ignoreClienteId) qs.set("ignoreClienteId", opts.ignoreClienteId);
  if (opts?.ignoreFornecedorId) qs.set("ignoreFornecedorId", opts.ignoreFornecedorId);
  try {
    const res = await fetch(`/api/parceiros/lookup?${qs.toString()}`);
    if (!res.ok) return VAZIO;
    return (await res.json()) as ParceiroLookupResult;
  } catch {
    return VAZIO;
  }
}
