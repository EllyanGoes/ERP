import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canAccess } from "@/lib/auth";

export default async function ComprasLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || !canAccess(session, "compras")) {
    redirect("/dashboard?erro=sem_permissao");
  }
  return <>{children}</>;
}
