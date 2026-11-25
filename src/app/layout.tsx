import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ERP",
  description: "Sistema ERP",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Tema salvo na conta vira o padrão: navegador novo já abre no tema certo.
  const session = await getSession().catch(() => null);
  const prefs = session
    ? ((await prisma.usuario.findUnique({ where: { id: session.sub }, select: { preferencias: true } }).catch(() => null))?.preferencias as { tema?: string } | null)
    : null;
  const temaConta = prefs?.tema && ["light", "dark", "system"].includes(prefs.tema) ? prefs.tema : "light";
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme={temaConta} enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
