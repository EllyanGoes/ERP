import { redirect } from "next/navigation";

// Cadastro legado de itens (código manual, sem unidade/tipo/categoria) —
// produto novo só pelo cadastro de Produtos, que aplica as regras obrigatórias.
export default function NovoItemPage() {
  redirect("/suprimentos/produtos/novo");
}
