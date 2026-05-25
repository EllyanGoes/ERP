"use client";

import { createContext, useContext, useState } from "react";

type ShortcutsContextValue = {
  open: boolean;
  openShortcuts:  () => void;
  closeShortcuts: () => void;
};

const ShortcutsContext = createContext<ShortcutsContextValue>({
  open: false,
  openShortcuts:  () => {},
  closeShortcuts: () => {},
});

export function ShortcutsProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <ShortcutsContext.Provider value={{ open, openShortcuts: () => setOpen(true), closeShortcuts: () => setOpen(false) }}>
      {children}
    </ShortcutsContext.Provider>
  );
}

export function useShortcuts() {
  return useContext(ShortcutsContext);
}
