import Sidebar from "@/components/layout/Sidebar";
import TabBar from "@/components/layout/TabBar";
import { TabsProvider } from "@/lib/tabs-context";
import { SessionProvider } from "@/lib/session-context";
import { DirtyFormProvider } from "@/lib/dirty-form-context";
import { getSession } from "@/lib/auth";

export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const user = session
    ? { id: session.sub, nome: session.nome, email: session.email, perfil: session.perfil, modulos: session.modulos }
    : null;

  return (
    <SessionProvider initial={user}>
      <TabsProvider>
        <DirtyFormProvider>
          <div className="flex h-screen bg-gray-50">
            <Sidebar />
            <div
              className="flex flex-col flex-1 overflow-hidden transition-all duration-200"
              style={{ marginLeft: "var(--sidebar-width, 64px)" }}
            >
              <TabBar />
              <main id="erp-main" className="flex-1 overflow-y-auto">
                {children}
              </main>
            </div>
          </div>
        </DirtyFormProvider>
      </TabsProvider>
    </SessionProvider>
  );
}
