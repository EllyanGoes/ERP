import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { CONSUMIDOR_FINAL_ID } from "@/lib/consumidor-final";
import PageHeader from "@/components/shared/PageHeader";
import ClienteForm from "@/components/clientes/ClienteForm";

export const dynamic = "force-dynamic";

export default async function EditarClientePage({ params }: { params: { id: string } }) {
  if (params.id === CONSUMIDOR_FINAL_ID) redirect(`/clientes/${params.id}`); // cadastro genérico, somente leitura
  const cliente = await prisma.cliente.findUnique({ where: { id: params.id } });
  if (!cliente) notFound();

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Editar Cliente"
        breadcrumbs={[{ label: "Clientes", href: "/clientes" }, { label: cliente.razaoSocial, href: `/clientes/${cliente.id}` }, { label: "Editar" }]}
      />
      <div className="px-8 pb-8 max-w-6xl flex-1 flex flex-col">
        <ClienteForm cliente={cliente as any} />
      </div>
    </div>
  );
}
