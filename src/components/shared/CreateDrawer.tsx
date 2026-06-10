"use client";

import { createContext, useContext, useCallback, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useDirtyFormContext } from "@/lib/dirty-form-context";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// CreateDrawer — painel deslizante pela direita para CRIAÇÃO de registros.
//
// O "+ Novo" das listas abre o formulário aqui dentro, sem sair da lista; as
// rotas /nova continuam existindo com o mesmo formulário em página cheia
// (link direto/⌘K). O formulário descobre que está num drawer pelo
// CreateDrawerContext: o useCreateFlow e o useVoltarCriacao fecham o painel e
// atualizam a lista em vez de mexer nas abas.
//
// Fechar (X/ESC/clique fora) passa pelo guard global de formulário sujo —
// mesmo confirmador usado na navegação entre abas.
// ─────────────────────────────────────────────────────────────────────────────

type CreateDrawerCtx = {
  /** Fecha o painel sem refresh (cancelar). */
  fechar: () => void;
  /** Fecha o painel e atualiza a lista (após criar). */
  aposCriar: () => void;
  /** Remonta o formulário zerado ("cadastrar outro") e atualiza a lista. */
  recriar: () => void;
};

const Ctx = createContext<CreateDrawerCtx | null>(null);

/** null fora de um CreateDrawer — é assim que os hooks decidem o comportamento. */
export function useCreateDrawer() {
  return useContext(Ctx);
}

const LARGURAS = {
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
} as const;

export default function CreateDrawer({
  open,
  onOpenChange,
  title,
  width = "lg",
  onCreated,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  width?: keyof typeof LARGURAS;
  /** Chamado ao fechar após uma criação — refaça o fetch da lista aqui. */
  onCreated: () => void;
  children: ReactNode;
}) {
  const { attemptNavigate, markClean } = useDirtyFormContext();
  const [conteudoKey, setConteudoKey] = useState(0);

  const fechar = useCallback(() => {
    markClean();
    onOpenChange(false);
  }, [markClean, onOpenChange]);

  const aposCriar = useCallback(() => {
    markClean();
    onOpenChange(false);
    onCreated();
  }, [markClean, onOpenChange, onCreated]);

  const recriar = useCallback(() => {
    markClean();
    setConteudoKey((k) => k + 1); // remonta o form zerado
    onCreated(); // a lista já pode mostrar o registro recém-criado
  }, [markClean, onCreated]);

  // Radix dispara onOpenChange(false) no ESC/overlay/X — intercepta com o guard
  const handleOpenChange = useCallback(
    (novo: boolean) => {
      if (novo) onOpenChange(true);
      else attemptNavigate(fechar);
    },
    [onOpenChange, attemptNavigate, fechar]
  );

  return (
    <>
      {/* Overlay próprio: o Sheet roda NÃO-modal (modal teria pointer-events
          bloqueado no body, matando os dropdowns dos formulários, que abrem
          via portal no document.body). Clique no overlay fecha com guard. */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={() => handleOpenChange(false)}
          aria-hidden
        />
      )}
      <Sheet open={open} onOpenChange={handleOpenChange} modal={false}>
        <SheetContent
          side="right"
          className={cn("w-full flex flex-col p-0", LARGURAS[width])}
          // não-modal: cliques nos menus portalados não podem fechar o painel
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetHeader className="px-6 py-4">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5 bg-gray-50/60">
            {/* monta o conteúdo só com o painel aberto: o form nasce zerado a cada abertura */}
            {open && (
              <Ctx.Provider value={{ fechar, aposCriar, recriar }}>
                <div key={conteudoKey}>{children}</div>
              </Ctx.Provider>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * Função de "voltar para a lista" usada por botões Cancelar e finais de fluxo
 * de criação: dentro de um CreateDrawer fecha o painel; em página cheia
 * navega para a rota da lista.
 */
export function useVoltarCriacao(listaHref: string, opts?: { aposCriar?: boolean }) {
  const drawer = useCreateDrawer();
  const router = useRouter();
  const aposCriar = opts?.aposCriar ?? false;
  return useCallback(() => {
    if (drawer) {
      if (aposCriar) drawer.aposCriar();
      else drawer.fechar();
    } else {
      router.push(listaHref);
    }
  }, [drawer, router, listaHref, aposCriar]);
}
