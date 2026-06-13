"use client";

// Padrão de preenchimento do sistema: ao teclar Enter num campo, o foco vai
// para o PRÓXIMO campo a preencher; quando não há mais campos, vai para o botão
// de salvar/confirmar (e aí o Enter confirma, comportamento nativo do botão).
//
// Funciona via um listener global (captura) sobre campos nativos (input/select).
// A maioria dos formulários aqui não é um <form> de verdade (são diálogos/cards
// com botão de ação por onClick), então o "escopo" do formulário é descoberto
// subindo até o ancestral mais próximo que contém um botão de salvar/confirmar.
// Widgets que tratam o Enter por conta própria (combobox/command/autocomplete)
// ou marcados com [data-enter-ignore] são respeitados.

import { useEffect } from "react";

const ACAO_REGEX = /salvar|concluir|registrar|confirmar|adicionar|criar|atualizar|gravar|enviar|transferir|receber|lançar|lancar|baixar/i;

function ehBotaoDeAcao(b: HTMLButtonElement): boolean {
  if (b.type === "submit") return true;
  return ACAO_REGEX.test((b.textContent || "").trim());
}

// Ancestral mais próximo que delimita o formulário (contém um botão de ação).
function acharEscopo(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  let depth = 0;
  while (node && node !== document.body && depth < 14) {
    if (node.matches("form, [role=dialog], dialog, [data-enter-scope]")) return node;
    const botoes = node.querySelectorAll<HTMLButtonElement>("button");
    for (const b of Array.from(botoes)) {
      if (!b.disabled && ehBotaoDeAcao(b)) return node;
    }
    node = node.parentElement;
    depth++;
  }
  return null;
}

function visivelEFocavel(f: HTMLElement): boolean {
  if ((f as HTMLInputElement).disabled) return false;
  if (f.getAttribute("type") === "hidden") return false;
  if (f.tabIndex < 0) return false;
  if (f.offsetParent === null && getComputedStyle(f).position !== "fixed") return false;
  return true;
}

export default function EnterFieldNavigation() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.isComposing || e.defaultPrevented) return;

      const el = e.target as HTMLElement | null;
      if (!el) return;
      const tag = el.tagName;
      const isInput = tag === "INPUT";
      const isSelect = tag === "SELECT";
      if (!isInput && !isSelect) return; // textarea quebra linha; botões têm semântica própria

      if (isInput) {
        const type = (el as HTMLInputElement).type;
        if (["checkbox", "radio", "button", "submit", "reset", "file"].includes(type)) return;
        if ((el as HTMLInputElement).list) return; // input com datalist tem Enter próprio
      }
      // Widgets que já tratam o Enter (busca de combobox/command).
      if (el.closest("[data-enter-ignore],[role=combobox],[role=listbox],[aria-autocomplete],[cmdk-root]")) return;

      const scope = acharEscopo(el);
      if (!scope) return; // sem formulário claro, não interfere

      const focusables = Array.from(
        scope.querySelectorAll<HTMLElement>("input, select, textarea, button"),
      ).filter(visivelEFocavel);

      const idx = focusables.indexOf(el);
      if (idx === -1) return;

      const rest = focusables.slice(idx + 1);
      const proximoCampo = rest.find((f) => ["INPUT", "SELECT", "TEXTAREA"].includes(f.tagName));
      const salvar =
        rest.find((f) => f.tagName === "BUTTON" && ehBotaoDeAcao(f as HTMLButtonElement)) ??
        focusables.find((f) => f.tagName === "BUTTON" && ehBotaoDeAcao(f as HTMLButtonElement));

      if (proximoCampo) {
        e.preventDefault();
        proximoCampo.focus();
        if (proximoCampo.tagName === "INPUT") {
          try { (proximoCampo as HTMLInputElement).select(); } catch { /* tipos sem select() */ }
        }
      } else if (salvar) {
        // Último campo → leva ao botão de salvar; o usuário confirma com Enter.
        e.preventDefault();
        salvar.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return null;
}
