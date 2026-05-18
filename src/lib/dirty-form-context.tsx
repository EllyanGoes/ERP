"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type DirtyCtx = {
  isDirty: boolean;
  registerDirty: (onSave?: () => Promise<void>) => void;
  markClean: () => void;
  attemptNavigate: (proceed: () => void) => void;
};

const Ctx = createContext<DirtyCtx>({
  isDirty: false,
  registerDirty: () => {},
  markClean: () => {},
  attemptNavigate: (p) => p(),
});

export function useDirtyFormContext() { return useContext(Ctx); }

/**
 * useDirtyForm — call in any form page to register dirty state.
 * isDirty: computed by the page (compare current state to baseline)
 * onSave: optional async function that saves the form (used by the "Salvar" button)
 */
export function useDirtyForm(isDirty: boolean, onSave?: () => Promise<void>) {
  const { registerDirty, markClean } = useDirtyFormContext();
  const onSaveStable = useRef(onSave);
  onSaveStable.current = onSave;

  useEffect(() => {
    if (isDirty) {
      registerDirty(onSaveStable.current);
    } else {
      markClean();
    }
  }, [isDirty, registerDirty, markClean]);

  // Cleanup on page unmount
  useEffect(() => () => markClean(), [markClean]);

  // Browser tab close
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}

export function DirtyFormProvider({ children }: { children: React.ReactNode }) {
  const [isDirty, setIsDirty] = useState(false);
  const onSaveRef = useRef<(() => Promise<void>) | undefined>();
  const pendingRef = useRef<(() => void) | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const registerDirty = useCallback((onSave?: () => Promise<void>) => {
    setIsDirty(true);
    onSaveRef.current = onSave;
  }, []);

  const markClean = useCallback(() => {
    setIsDirty(false);
    onSaveRef.current = undefined;
  }, []);

  const attemptNavigate = useCallback((proceed: () => void) => {
    if (!isDirty) { proceed(); return; }
    pendingRef.current = proceed;
    setShowModal(true);
  }, [isDirty]);

  function confirmLeave() {
    setShowModal(false);
    setIsDirty(false);
    onSaveRef.current = undefined;
    const go = pendingRef.current;
    pendingRef.current = null;
    go?.();
  }

  async function saveAndLeave() {
    if (!onSaveRef.current) { confirmLeave(); return; }
    setSaving(true);
    try {
      await onSaveRef.current();
      confirmLeave();
    } catch { /* keep modal open on error */ }
    finally { setSaving(false); }
  }

  const modal = showModal && mounted ? createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="text-5xl select-none leading-none">⚠️</div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Há alterações não salvas no formulário!
            </h2>
            <p className="text-gray-500 text-sm">
              Você pode perder as alterações. O que deseja fazer?
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 justify-end">
          <Button
            variant="outline"
            onClick={() => { setShowModal(false); pendingRef.current = null; }}
            className="border-red-800 text-red-800 hover:bg-red-50"
          >
            Continuar editando
          </Button>
          {onSaveRef.current && (
            <Button
              variant="outline"
              onClick={saveAndLeave}
              disabled={saving}
              className="border-red-800 text-red-800 hover:bg-red-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Salvar
            </Button>
          )}
          <Button
            onClick={confirmLeave}
            className="bg-red-800 hover:bg-red-900 text-white"
          >
            Sair da página
          </Button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <Ctx.Provider value={{ isDirty, registerDirty, markClean, attemptNavigate }}>
      {children}
      {modal}
    </Ctx.Provider>
  );
}
