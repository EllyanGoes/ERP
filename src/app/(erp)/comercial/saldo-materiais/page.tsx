import { redirect } from "next/navigation";

// A visão por material foi unificada em Saldos (alternável Cliente/Material).
// Mantém a rota antiga viva, redirecionando para a tela única.
export default function SaldoMateriaisPage() {
  redirect("/comercial/saldo-clientes");
}
