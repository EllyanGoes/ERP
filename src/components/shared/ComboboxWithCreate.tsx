"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Search, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Optional: agrupa as opções sob um cabeçalho (ex.: "Produtos Acabados"). */
  group?: string;
  /** Optional: bold code prefix displayed separately (e.g. "PROD-0001") */
  code?: string;
  /** Optional: stock balance shown in blue */
  saldo?: number | null;
  /**
   * Optional: fully custom rendering of the option content, used both in the
   * dropdown list and in the trigger. `label` is still used for search matching.
   */
  render?: () => React.ReactNode;
}

export interface CreateModalArgs {
  initialValue: string;
  onCreated: (id: string, label: string) => void;
  onClose: () => void;
}

interface Props {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  noneLabel?: string;
  allowNone?: boolean;
  createHref?: string;
  createParam?: string;
  createLabel?: string;
  className?: string;
  disabled?: boolean;
  triggerClassName?: string;
  /** Largura mínima do menu (px). Padrão 220 — aumente p/ rótulos longos (ex.: nomes). */
  menuMinWidth?: number;
  /** When provided, clicking "Criar X" opens this dialog instead of navigating */
  renderCreateModal?: (args: CreateModalArgs) => React.ReactNode;
  /**
   * Values that should appear in the list but are "already used" —
   * they get a green checkmark and cannot be re-selected.
   */
  disabledValues?: string[];
}

export default function ComboboxWithCreate({
  options,
  value,
  onChange,
  placeholder = "Selecionar...",
  noneLabel = "Nenhum",
  allowNone = true,
  createHref,
  createParam = "nome",
  createLabel,
  className,
  disabled,
  triggerClassName,
  menuMinWidth = 220,
  renderCreateModal,
  disabledValues = [],
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createModal, setCreateModal] = useState<{ value: string } | null>(null);
  // Locally created options so they appear immediately after inline creation
  const [extraOptions, setExtraOptions] = useState<ComboboxOption[]>([]);
  const [dropdownPos, setDropdownPos] = useState<{
    top?: number; bottom?: number; left: number; width: number; maxHeight: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Close on outside click (checks both the trigger container and the portal dropdown)
  useEffect(() => {
    function handle(e: MouseEvent) {
      const target = e.target as Node;
      if (
        containerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) return;
      setOpen(false);
      setSearch("");
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function calcPosition() {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const DROPDOWN_MAX_H = 260;
    const MARGIN = 8;
    const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
    const spaceAbove = rect.top - MARGIN;
    const openUpward = spaceBelow < DROPDOWN_MAX_H && spaceAbove > spaceBelow;
    // Largura do menu (no mín. menuMinWidth), travada dentro da viewport.
    const width = Math.max(rect.width, menuMinWidth);
    const left = Math.min(rect.left, Math.max(MARGIN, window.innerWidth - width - MARGIN));

    if (openUpward) {
      setDropdownPos({
        bottom:    window.innerHeight - rect.top + 4,
        left,
        width,
        maxHeight: Math.min(DROPDOWN_MAX_H, spaceAbove),
      });
    } else {
      setDropdownPos({
        top:       rect.bottom + 4,
        left,
        width,
        maxHeight: Math.min(DROPDOWN_MAX_H, spaceBelow),
      });
    }
  }

  useEffect(() => {
    if (!open) return;
    calcPosition();
    setTimeout(() => inputRef.current?.focus(), 10);
    window.addEventListener("scroll", calcPosition, true);
    window.addEventListener("resize", calcPosition);
    return () => {
      window.removeEventListener("scroll", calcPosition, true);
      window.removeEventListener("resize", calcPosition);
    };
  }, [open]);

  // Merge parent options with locally created ones (dedup by value)
  const allOptions = [
    ...options,
    ...extraOptions.filter((e) => !options.some((o) => o.value === e.value)),
  ];
  const selected = allOptions.find((o) => o.value === value);
  const filtered = allOptions.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );
  const showCreate = !!createHref && search.trim().length > 0;

  function select(v: string) {
    onChange(v);
    setOpen(false);
    setSearch("");
  }

  function handleCreate() {
    if (!createHref) return;
    if (renderCreateModal) {
      // Open inline dialog
      setCreateModal({ value: search.trim() });
      setOpen(false);
      setSearch("");
    } else {
      // Navigate to creation page
      router.push(`${createHref}?${createParam}=${encodeURIComponent(search.trim())}&create=1`);
      setOpen(false);
      setSearch("");
    }
  }

  function handleCreated(id: string, label: string) {
    setExtraOptions((prev) => [...prev, { value: id, label }]);
    onChange(id);
    setCreateModal(null);
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((p) => !p)}
        className={cn(
          "w-full flex items-center justify-between gap-2 h-9 px-3 rounded-md border border-input bg-background text-sm transition-colors",
          "hover:border-border focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0",
          disabled && "opacity-50 cursor-not-allowed",
          triggerClassName
        )}
      >
        <span className={cn("truncate flex items-baseline gap-1.5", !selected && "text-muted-foreground")}>
          {selected
            ? selected.render
              ? selected.render()
              : selected.code
                ? <><span className="font-bold text-foreground">[{selected.code}]</span><span>{selected.label.replace(`[${selected.code}] `, "")}</span></>
                : selected.label
            : placeholder}
        </span>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {/* Portal dropdown — rendered into document.body to escape any overflow:hidden parent */}
      {mounted && open && dropdownPos && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: "fixed",
            top:      dropdownPos.top,
            bottom:   dropdownPos.bottom,
            left:     dropdownPos.left,
            width:    dropdownPos.width,
            zIndex:   9999,
          }}
          className="bg-card rounded-xl border border-border shadow-lg overflow-hidden flex flex-col"
        >
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="flex-1 text-sm outline-none bg-transparent placeholder:text-muted-foreground"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="text-muted-foreground/60 hover:text-muted-foreground">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Options list */}
          <div className="overflow-y-auto py-1 flex-1" style={{ maxHeight: dropdownPos ? dropdownPos.maxHeight - 52 : 208 }}>
            {allowNone && (
              <button
                type="button"
                onClick={() => select("")}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted transition-colors text-left",
                  value === "" && "bg-info/10 text-info"
                )}
              >
                <span className="text-muted-foreground italic">{noneLabel}</span>
                {value === "" && <Check className="w-3.5 h-3.5 text-info" />}
              </button>
            )}

            {filtered.length === 0 && !showCreate && (
              <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                {search ? "Nenhum resultado" : "Nenhuma opção disponível"}
              </p>
            )}

            {(() => {
              const disabledOpts  = filtered.filter((o) => disabledValues.includes(o.value));
              const availableOpts = filtered.filter((o) => !disabledValues.includes(o.value));
              const showSeparator = disabledOpts.length > 0 && availableOpts.length > 0;

              const renderOpt = (opt: ComboboxOption) => {
                const isDisabled = disabledValues.includes(opt.value);
                const isSelected = value === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { if (!isDisabled) select(opt.value); }}
                    disabled={isDisabled}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 text-sm transition-colors text-left",
                      isDisabled
                        ? "cursor-not-allowed bg-success/10 text-muted-foreground"
                        : isSelected
                        ? "bg-info/10 text-info hover:bg-info/10"
                        : "hover:bg-muted"
                    )}
                  >
                    {/* Label — custom render, or bold code + blue saldo */}
                    <span className="flex-1 min-w-0">
                      {opt.render ? (
                        opt.render()
                      ) : opt.code ? (
                        <span className="flex items-baseline gap-1.5">
                          <span className="font-bold text-foreground shrink-0">[{opt.code}]</span>
                          <span className="truncate">{opt.label.replace(`[${opt.code}] `, "")}</span>
                          {opt.saldo !== undefined && opt.saldo !== null && (
                            <span className="ml-1 text-xs font-semibold text-info shrink-0">
                              {opt.saldo.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="truncate">{opt.label}</span>
                      )}
                    </span>
                    {isDisabled && (
                      <span className="flex items-center gap-1 shrink-0 text-success">
                        <Check className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-semibold leading-none">vinculado</span>
                      </span>
                    )}
                    {!isDisabled && isSelected && <Check className="w-3.5 h-3.5 text-info shrink-0" />}
                  </button>
                );
              };

              // Agrupa as disponíveis por `group` (na ordem de 1ª aparição) quando houver.
              const renderAvailable = () => {
                if (!availableOpts.some((o) => o.group)) return availableOpts.map(renderOpt);
                const ordem: string[] = [];
                const porGrupo = new Map<string, ComboboxOption[]>();
                for (const o of availableOpts) {
                  const g = o.group ?? "Outros";
                  if (!porGrupo.has(g)) { porGrupo.set(g, []); ordem.push(g); }
                  porGrupo.get(g)!.push(o);
                }
                return ordem.map((g) => (
                  <div key={g}>
                    <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">{g}</div>
                    {porGrupo.get(g)!.map(renderOpt)}
                  </div>
                ));
              };

              return (
                <>
                  {disabledOpts.map(renderOpt)}
                  {showSeparator && (
                    <div className="flex items-center gap-2 px-3 py-1.5">
                      <div className="flex-1 h-px bg-muted" />
                      <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Disponíveis</span>
                      <div className="flex-1 h-px bg-muted" />
                    </div>
                  )}
                  {renderAvailable()}
                </>
              );
            })()}
          </div>

          {/* Create option */}
          {showCreate && (
            <div className="border-t border-border py-1">
              <button
                type="button"
                onClick={handleCreate}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-info hover:bg-info/10 transition-colors text-left"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>Criar</span>
                <span className="font-medium bg-muted text-foreground px-1.5 py-0.5 rounded text-xs truncate max-w-[160px]">
                  {search.trim()}
                </span>
                {createLabel && (
                  <span className="text-muted-foreground text-xs ml-auto shrink-0">{createLabel}</span>
                )}
              </button>
            </div>
          )}
        </div>,
        document.body
      )}

      {/* Inline create modal (only when renderCreateModal is provided) */}
      {createModal && renderCreateModal && renderCreateModal({
        initialValue: createModal.value,
        onCreated: handleCreated,
        onClose: () => setCreateModal(null),
      })}
    </div>
  );
}
