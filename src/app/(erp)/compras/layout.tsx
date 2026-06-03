import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getUserModulos, hasModulo } from "@/lib/permissions";

export default async function ComprasLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const modulos = session ? await getUserModulos(session.sub) : [];
  if (!session || !hasModulo(modulos, "compras")) {
    redirect("/dashboard?erro=sem_permissao");
  }
  return <>{children}</>;
}
