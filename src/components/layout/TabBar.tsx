"use client";

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Search } from "lucide-react";
import { useTabsContext, type Tab } from "@/lib/tabs-context";
import { useDirtyFormContext } from "@/lib/dirty-form-context";
import { routeColor } from "@/lib/route-registry";
import { cn } from "@/lib/utils";
import EmpresaSelector from "@/components/layout/EmpresaSelector";
import NotificationCenter from "@/components/layout/NotificationCenter";

type DropTarget = { id: string; side: "before" | "after" } | null;

export default function TabBar() {
  const { tabs, activeHref, closeTab, reorderTabs } = useTabsContext();
  const { attemptNavigate } = useDirtyFormContext();
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const dragIdRef = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);

  // Scroll active tab into view when it changes
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [activeHref]);

  if (tabs.length === 0) return null;

  function handleDragStart(tabId: string) {
    dragIdRef.current = tabId;
  }

  function handleDragOver(e: React.DragEvent, tabId: string) {
    e.preventDefault();
    if (!dragIdRef.current || dragIdRef.current === tabId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const side: "before" | "after" = e.clientX < rect.left + rect.width / 2 ? "before" : "after";
    setDropTarget({ id: tabId, side });
  }

  function handleDrop(e: React.DragEvent, tabId: string) {
    e.preventDefault();
    if (!dragIdRef.current || !dropTarget || dragIdRef.current === tabId) {
      setDropTarget(null);
      return;
    }
    reorderTabs(dragIdRef.current, tabId, dropTarget.side);
    dragIdRef.current = null;
    setDropTarget(null);
  }

  function handleDragEnd() {
    dragIdRef.current = null;
    setDropTarget(null);
  }

  return (
    <div
      className="flex items-end bg-muted border-b border-border select-none shrink-0"
      style={{ minHeight: 36 }}
      onDragOver={(e) => e.preventDefault()}
    >
      <div
        ref={scrollRef}
        className="flex items-end overflow-x-auto scrollbar-none flex-1"
        style={{ scrollbarWidth: "none" }}
      >
        {tabs.map((tab) => {
          const isActive = tab.href === activeHref;
          const isDragging = dragIdRef.current === tab.id;
          const showBefore = dropTarget?.id === tab.id && dropTarget.side === "before";
          const showAfter  = dropTarget?.id === tab.id && dropTarget.side === "after";

          return (
            <div
              key={tab.id}
              className="relative flex items-end shrink-0"
              draggable
              onDragStart={() => handleDragStart(tab.id)}
              onDragOver={(e) => handleDragOver(e, tab.id)}
              onDrop={(e) => handleDrop(e, tab.id)}
              onDragEnd={handleDragEnd}
            >
              {/* Left drop indicator */}
              {showBefore && (
                <span className="absolute left-0 top-1 bottom-0 w-0.5 bg-blue-500 z-10 rounded-full" />
              )}

              <button
                ref={isActive ? activeRef : undefined}
                onClick={() => router.push(tab.href)}
                className={cn(
                  "group relative flex items-center gap-1.5 px-3 h-9 text-[13px] font-medium",
                  "transition-colors duration-100 focus:outline-none",
                  "border-r border-border/60",
                  isDragging && "opacity-40",
                  isActive
                    ? "bg-background text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-background"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                  "cursor-grab active:cursor-grabbing"
                )}
                style={{ maxWidth: 200, minWidth: 80 }}
                title={tab.title}
              >
                {/* Icon */}
                {tab.icon && (() => {
                  const Icon = tab.icon!;
                  const color = routeColor(tab.section ?? "");
                  return (
                    <span className={cn(
                      "flex shrink-0 items-center justify-center w-4 h-4 rounded",
                      isActive ? `${color.selBg} ${color.selText}` : `${color.bg} ${color.text}`
                    )}>
                      <Icon className="w-2.5 h-2.5" />
                    </span>
                  );
                })()}

                {/* Title */}
                <span className="truncate flex-1 text-left" style={{ maxWidth: 140 }}>
                  {tab.title}
                </span>

                {/* Close button */}
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => { e.stopPropagation(); attemptNavigate(() => closeTab(tab.id)); }}
                  className={cn(
                    "flex items-center justify-center w-4 h-4 rounded-full shrink-0",
                    "transition-colors",
                    isActive
                      ? "text-muted-foreground hover:bg-accent hover:text-foreground"
                      : "text-transparent group-hover:text-muted-foreground group-hover:hover:bg-accent group-hover:hover:text-foreground"
                  )}
                >
                  <X className="w-3 h-3" strokeWidth={2.5} />
                </span>
              </button>

              {/* Right drop indicator */}
              {showAfter && (
                <span className="absolute right-0 top-1 bottom-0 w-0.5 bg-blue-500 z-10 rounded-full" />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-1 pr-1.5 pb-1 shrink-0">
        <button
          onClick={() => window.dispatchEvent(new Event("command-palette:open"))}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Buscar (⌘K)"
          aria-label="Buscar"
        >
          <Search className="w-[18px] h-[18px]" />
        </button>
        <NotificationCenter />
        <EmpresaSelector />
      </div>
    </div>
  );
}
