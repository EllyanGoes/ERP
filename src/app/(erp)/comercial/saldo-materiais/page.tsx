export const dynamic = "force-dynamic";

import { getSaldoMateriaisAEntregar } from "@/lib/saldo-materiais";
import SaldoMateriaisView from "@/components/comercial/SaldoMateriaisView";

export default async function SaldoMateriaisPage() {
  const materiais = await getSaldoMateriaisAEntregar();
  return <SaldoMateriaisView materiais={materiais} />;
}
