import Sidebar from "@/components/layout/Sidebar";
import TabBar from "@/components/layout/TabBar";
import ScrollRestorer from "@/components/layout/ScrollRestorer";
import CommandPalette from "@/components/layout/CommandPalette";
import HelpPanel from "@/components/layout/HelpPanel";
import EnterFieldNavigation from "@/components/layout/EnterFieldNavigation";
import ColumnResizer from "@/components/shared/ColumnResizer";
import { TabsProvider } from "@/lib/tabs-context";
import { SessionProvider } from "@/lib/session-context";
import { DirtyFormProvider } from "@/lib/dirty-form-context";
import { ShortcutsProvider } from "@/lib/shortcuts-context";
import { getSession } from "@/lib/auth";
import { getUserModulos } from "@/lib/permissions";
import { empresasParaSessao } from "@/lib/empresa";

export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const empresaSessao = session
    ? await empresasParaSessao(session.sub, session.perfil, session.activeEmpresaId)
    : null;
  const user = session
    ? {
        id: session.sub,
        nome: session.nome,
        email: session.email,
        perfil: session.perfil,
        modulos: await getUserModulos(session.sub),
        empresas: empresaSessao?.empresas,
        activeEmpresaId: empresaSessao?.activeEmpresaId,
      }
    : null;

  return (
    <SessionProvider initial={user}>
      <ShortcutsProvider>
      <TabsProvider>
        <DirtyFormProvider>
          <div className="flex h-screen bg-background">
            <Sidebar />
            <div
              className="flex flex-col flex-1 overflow-hidden transition-[margin-left] duration-200"
              style={{ marginLeft: "var(--sidebar-width, 64px)" }}
            >
              <TabBar />
              <ScrollRestorer />
              <main id="erp-main" className="flex-1 overflow-y-auto">
                {children}
              </main>
            </div>
          </div>
          <CommandPalette />
          <HelpPanel />
          <EnterFieldNavigation />
          <ColumnResizer />
        </DirtyFormProvider>
      </TabsProvider>
      </ShortcutsProvider>
    </SessionProvider>
  );
}
