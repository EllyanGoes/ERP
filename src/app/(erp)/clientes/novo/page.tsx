import PageHeader from "@/components/shared/PageHeader";
import ClienteForm from "@/components/clientes/ClienteForm";

export const dynamic = "force-dynamic";

export default function NovoClientePage() {
  return (
    <div>
      <PageHeader
        title="Novo Cliente"
        breadcrumbs={[{ label: "Clientes", href: "/clientes" }, { label: "Novo" }]}
      />
      <div className="px-8 pb-8 max-w-6xl">
        <ClienteForm />
      </div>
    </div>
  );
}
