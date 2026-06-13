"use client";

// Padrão de preenchimento do sistema:
//  1) ao abrir um formulário/diálogo, o PRIMEIRO campo recebe foco sozinho;
//  2) teclar Enter num campo move o foco para o PRÓXIMO campo a preencher;
//  3) no último campo, o foco vai para o botão de salvar/confirmar (e aí o Enter
//     confirma, comportamento nativo do botão).
//
// Funciona via um listener global (captura) sobre campos nativos (input/select)
// mais um observador que autofoca o primeiro campo de cada modal que abre. A
// maioria dos formulários aqui não é um <form> de verdade (são diálogos/cards com
// botão de ação por onClick), então o "escopo" do formulário é o ancestral mais
// próximo que contém um botão de salvar/confirmar. Widgets que tratam o Enter por
// conta própria (combobox/command/autocomplete) ou marcados com
// [data-enter-ignore] são respeitados.

import { useEffect } from "react";

const ACAO_REGEX = /salvar|concluir|registrar|confirmar|adicionar|criar|atualizar|gravar|enviar|transferir|receber|lançar|lancar|baixar/i;
// Seletor dos contêineres que contam como "modal/formulário aberto".
const MODAL_SEL = "[role=dialog],[data-enter-scope],.fixed.inset-0";

function ehBotaoDeAcao(b: HTMLButtonElement): boolean {
  if (b.type === "submit") return true;
  return ACAO_REGEX.test((b.textContent || "").trim());
}

function visivelEFocavel(f: HTMLElement): boolean {
  if ((f as HTMLInputElement).disabled) return false;
  if (f.getAttribute("type") === "hidden") return false;
  if (f.tabIndex < 0) return false;
  if ((f as HTMLInputElement).readOnly === true) return false;
  if (f.offsetParent === null && getComputedStyle(f).position !== "fixed") return false;
  return true;
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

function camposDe(scope: HTMLElement): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>("input, select, textarea")).filter((f) => {
    if (!visivelEFocavel(f)) return false;
    if (f.tagName === "INPUT") {
      const t = (f as HTMLInputElement).type;
      if (["checkbox", "radio", "button", "submit", "reset", "file", "hidden"].includes(t)) return false;
    }
    return true;
  });
}

export default function EnterFieldNavigation() {
  useEffect(() => {
    // ── (1) Autofoco do primeiro campo quando um modal abre ───────────────────
    function autofocoEm(container: HTMLElement) {
      if (!container.matches?.(MODAL_SEL) && !container.querySelector?.(MODAL_SEL)) return;
      const modal = container.matches?.(MODAL_SEL) ? container : container.querySelector<HTMLElement>(MODAL_SEL);
      if (!modal) return;
      // Precisa ser um formulário (tem botão de ação) e ter ao menos um campo.
      const temAcao = Array.from(modal.querySelectorAll<HTMLButtonElement>("button")).some((b) => ehBotaoDeAcao(b));
      if (!temAcao) return;
      const campos = camposDe(modal);
      if (campos.length === 0) return;
      // Não rouba o foco se já há um campo focado dentro do modal.
      const ativo = document.activeElement as HTMLElement | null;
      if (ativo && modal.contains(ativo) && ["INPUT", "SELECT", "TEXTAREA"].includes(ativo.tagName)) return;
      const alvo = campos[0];
      requestAnimationFrame(() => {
        try {
          alvo.focus();
          if (alvo.tagName === "INPUT") (alvo as HTMLInputElement).select?.();
        } catch { /* ignore */ }
      });
    }

    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of Array.from(m.addedNodes)) {
          if (node instanceof HTMLElement) autofocoEm(node);
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });

    // Modais já presentes na montagem (ex.: navegação direta).
    document.querySelectorAll<HTMLElement>(MODAL_SEL).forEach(autofocoEm);

    // ── (2)+(3) Enter avança de campo / entra no formulário ───────────────────
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.isComposing || e.defaultPrevented) return;

      const el = e.target as HTMLElement | null;
      if (!el) return;
      const tag = el.tagName;
      const isInput = tag === "INPUT";
      const isSelect = tag === "SELECT";

      // Enter FORA de um campo (foco no body, no overlay, num botão): se houver um
      // modal/formulário aberto, joga o foco no primeiro campo dele.
      if (!isInput && !isSelect) {
        if (tag === "TEXTAREA" || tag === "BUTTON") return; // semântica própria
        const modais = Array.from(document.querySelectorAll<HTMLElement>(MODAL_SEL))
          .filter((mEl) => mEl.offsetParent !== null || getComputedStyle(mEl).position === "fixed");
        const modal = modais[modais.length - 1]; // o mais recente (topo)
        if (!modal) return;
        const campos = camposDe(modal);
        if (campos.length === 0) return;
        e.preventDefault();
        campos[0].focus();
        if (campos[0].tagName === "INPUT") { try { (campos[0] as HTMLInputElement).select(); } catch { /* */ } }
        return;
      }

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
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      obs.disconnect();
    };
  }, []);

  return null;
}
