"use client";

// Unidade, tipo de produto e categoria de estoque — obrigatórios em todo
// cadastro de produto (lib/produto-cadastro). Usado nas criações rápidas
// (SC, engenharia) e nas telas de cadastro/edição.
import { useEffect, useState } from "react";
import Link from "next/link";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import CategoriaEstoqueSelect from "@/components/shared/CategoriaEstoqueSelect";
import { TipoProdutoQuickCreate, UnidadeQuickCreate } from "@/components/shared/QuickCreateDialogs";
import { Label } from "@/components/ui/label";
import type { ProdutoDuplicado } from "@/lib/produto-cadastro";

export type CamposProduto = { unidadeId: string; tipoProdutoId: string; categoriaEstoque: string };
type Unidade = { id: string; sigla: string; nome: string };
type TipoProduto = { id: string; nome: string; ativo?: boolean };

/** Listas de unidades e tipos de produto (uma vez por montagem). */
export function useOpcoesProduto() {
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [tipos, setTipos] = useState<TipoProduto[]>([]);
  useEffect(() => {
    fetch("/api/suprimentos/unidades").then((r) => r.json()).then((j) => setUnidades(Array.isArray(j) ? j : j.data ?? [])).catch(() => {});
    fetch("/api/suprimentos/tipos-produto").then((r) => r.json()).then((j: TipoProduto[]) => setTipos(Array.isArray(j) ? j.filter((t) => t.ativo !== false) : [])).catch(() => {});
  }, []);
  return { unidades, tipos };
}

export const asterisco = <span className="text-red-500">*</span>;

export function UnidadeProdutoCombobox({ unidades, value, onChange, erro }: { unidades: Unidade[]; value: string; onChange: (v: string) => void; erro?: boolean }) {
  return (
    <ComboboxWithCreate
      options={unidades.map((u) => ({ value: u.id, label: `${u.sigla} — ${u.nome}` }))}
      value={value}
      onChange={onChange}
      allowNone={false}
      placeholder="Selecionar unidade..."
      createHref="/suprimentos/unidades"
      createParam="nome"
      createLabel="unidade de medida"
      renderCreateModal={(args) => <UnidadeQuickCreate {...args} />}
      triggerClassName={erro ? "border-red-300 focus:ring-red-400" : undefined}
    />
  );
}

export function TipoProdutoCombobox({ tipos, value, onChange, erro }: { tipos: TipoProduto[]; value: string; onChange: (v: string) => void; erro?: boolean }) {
  return (
    <ComboboxWithCreate
      options={tipos.map((t) => ({ value: t.id, label: t.nome }))}
      value={value}
      onChange={onChange}
      allowNone={false}
      placeholder="Selecionar tipo..."
      createHref="/suprimentos/tipos-produto"
      createParam="nome"
      createLabel="tipo de produto"
      renderCreateModal={(args) => <TipoProdutoQuickCreate {...args} />}
      triggerClassName={erro ? "border-red-300 focus:ring-red-400" : undefined}
    />
  );
}

/** Os três campos empilhados (modais de criação rápida). */
export default function CamposObrigatoriosProduto({ value, onChange, servico, ocultarCategoria, labelCls = "text-xs" }: {
  value: CamposProduto; onChange: (v: CamposProduto) => void; servico?: boolean; ocultarCategoria?: boolean; labelCls?: string;
}) {
  const { unidades, tipos } = useOpcoesProduto();
  // Pré-seleciona UN quando nada foi escolhido ainda.
  useEffect(() => {
    if (!value.unidadeId && unidades.length) {
      const un = unidades.find((u) => u.sigla === "UN");
      if (un) onChange({ ...value, unidadeId: un.id });
    }
  }, [unidades]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="space-y-1.5">
        <Label className={labelCls}>Unidade {asterisco}</Label>
        <UnidadeProdutoCombobox unidades={unidades} value={value.unidadeId} onChange={(v) => onChange({ ...value, unidadeId: v })} />
      </div>
      <div className="space-y-1.5">
        <Label className={labelCls}>Tipo de produto {asterisco}</Label>
        <TipoProdutoCombobox tipos={tipos} value={value.tipoProdutoId} onChange={(v) => onChange({ ...value, tipoProdutoId: v })} />
      </div>
      {!servico && !ocultarCategoria && (
        <div className="space-y-1.5">
          <Label className={labelCls}>Categoria de estoque {asterisco}</Label>
          <CategoriaEstoqueSelect value={value.categoriaEstoque} onChange={(v) => onChange({ ...value, categoriaEstoque: v })} />
        </div>
      )}
    </>
  );
}

/** Aviso do 409: o produto já existe — link para abrir e, opcionalmente, usar o existente. */
export function AvisoProdutoDuplicado({ duplicado, onUsar }: { duplicado: ProdutoDuplicado; onUsar?: () => void }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 space-y-1.5">
      <p>Já existe <b>{duplicado.codigo}</b> — {duplicado.descricao}. Não é possível cadastrar outro com a mesma descrição.</p>
      <div className="flex gap-2">
        {onUsar && <button type="button" onClick={onUsar} className="rounded border border-amber-400 bg-white px-2.5 py-0.5 text-xs font-medium hover:bg-amber-100">Usar este produto</button>}
        <Link href={`/suprimentos/produtos/${duplicado.id}`} target="_blank" className="rounded border border-amber-400 bg-white px-2.5 py-0.5 text-xs font-medium hover:bg-amber-100">Abrir cadastro</Link>
      </div>
    </div>
  );
}
