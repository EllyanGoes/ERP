import { redirect } from "next/navigation";

// Edição legada de itens — vai para o cadastro de Produtos (regras obrigatórias e trava de duplicado).
export default function EditarItemPage({ params }: { params: { id: string } }) {
  redirect(`/suprimentos/produtos/${params.id}`);
}
