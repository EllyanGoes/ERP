"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useTabsContext } from "@/lib/tabs-context";
import { useCreateDrawer } from "@/components/shared/CreateDrawer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type UseCreateFlowOptions = {
  /** Singular entity label, lowercase, e.g. "cliente", "pedido". Used in the dialog copy. */
  entity: string;
  /** Grammatical gender of the entity, for the "Cadastrado/Cadastrada" wording. Defaults to "m". */
  gender?: "m" | "f";
  /** Resets the form so the user can register another record. */
  onNew: () => void;
  /**
   * Builds the detail route for the created record. When provided, the dialog
   * shows a "Ver cadastro" button that replaces the current tab with the detail page.
   */
  viewHref?: (id: string) => string;
};

/**
 * Standard post-create flow for the whole ERP.
 *
 * After a record is created, call `confirmCreated(id)` instead of navigating.
 * A dialog asks whether to register another:
 *  - "Cadastrar outro" → resets the form, keeps the tab.
 *  - "Ver cadastro"    → replaces the current tab with the new record's page.
 *  - "Fechar"          → closes the current "Novo …" tab.
 *
 * Render the returned `dialog` somewhere inside the form.
 *
 * Dentro de um CreateDrawer (criação em painel lateral), as ações mudam de
 * alvo: "Fechar" fecha o painel e atualiza a lista; "Ver cadastro" fecha o
 * painel e abre a aba do registro. Fora do drawer, comportamento de abas.
 */
export function useCreateFlow({ entity, gender = "m", onNew, viewHref }: UseCreateFlowOptions) {
  const { closeCurrentTab, replaceCurrentTab } = useTabsContext();
  const drawer = useCreateDrawer();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const confirmCreated = useCallback((id?: string | number) => {
    setCreatedId(id != null ? String(id) : null);
    setOpen(true);
  }, []);

  const handleNew = useCallback(() => {
    setOpen(false);
    if (drawer) drawer.recriar(); // remonta o form zerado dentro do painel
    else onNew();
  }, [onNew, drawer]);

  const handleView = useCallback(() => {
    setOpen(false);
    if (createdId && viewHref) {
      if (drawer) {
        drawer.aposCriar();
        router.push(viewHref(createdId));
      } else {
        replaceCurrentTab(viewHref(createdId));
      }
    }
  }, [createdId, viewHref, replaceCurrentTab, drawer, router]);

  const handleClose = useCallback(() => {
    setOpen(false);
    if (drawer) drawer.aposCriar();
    else closeCurrentTab();
  }, [closeCurrentTab, drawer]);

  const cadastrado = gender === "f" ? "Cadastrada" : "Cadastrado";
  const novo = gender === "f" ? "nova" : "novo";

  const dialog = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{cadastrado} com sucesso</DialogTitle>
          <DialogDescription>Deseja cadastrar {novo} {entity}?</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Fechar</Button>
          {viewHref && createdId && (
            <Button variant="outline" onClick={handleView}>Ver cadastro</Button>
          )}
          <Button onClick={handleNew}>Cadastrar {novo}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirmCreated, dialog };
}
