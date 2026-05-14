import PageHeader from "@/components/shared/PageHeader";
import CadastroSimples from "@/components/suprimentos/CadastroSimples";

export const dynamic = "force-dynamic";

export default function TiposProdutoPage({
  searchParams,
}: {
  searchParams: { nome?: string; create?: string };
}) {
  return (
    <div>
      <PageHeader
        title="Tipos de Produto"
        breadcrumbs={[{ label: "Suprimentos" }, { label: "Cadastros" }, { label: "Tipos de Produto" }]}
      />
      <div className="px-8 pb-8 max-w-2xl">
        <CadastroSimples
          title="Tipos de Produto"
          description="Classifique os produtos por categoria (ex: Matéria-Prima, Embalagem, Consumível)"
          apiPath="/api/suprimentos/tipos-produto"
          campos={[
            { key: "nome", label: "Nome", placeholder: "Ex: Matéria-Prima" },
            { key: "descricao", label: "Descrição", placeholder: "Descrição opcional" },
          ]}
          emptyText="Nenhum tipo de produto cadastrado"
          initialCreate={searchParams.create === "1"}
          initialValues={{ nome: searchParams.nome ?? "" }}
        />
      </div>
    </div>
  );
}
