import PageHeader from "@/components/shared/PageHeader";
import ItemForm from "@/components/itens/ItemForm";

export default function NovoItemPage() {
  return (
    <div>
      <PageHeader
        title="Novo Item"
        breadcrumbs={[{ label: "Itens", href: "/itens" }, { label: "Novo" }]}
      />
      <div className="px-8 pb-8 max-w-3xl">
        <ItemForm />
      </div>
    </div>
  );
}
