/**
 * useFormPersist – persiste estado de formulário no sessionStorage para que
 * a troca de abas não perca os dados digitados.
 *
 * Padrão de uso em cada página de formulário:
 *
 *   const { save, load, clear } = useFormPersist<MyFormState>(`rota-unica:${id}`);
 *
 *   // 1. Restaurar ao montar
 *   useEffect(() => {
 *     const s = load();
 *     if (s) { setFrete(s.frete ?? ""); ... }
 *   }, []); // eslint-disable-line
 *
 *   // 2. Auto-salvar a cada mudança
 *   useEffect(() => { save({ frete, desconto, ... }); }, [frete, desconto, ...]);
 *
 *   // 3. Limpar após salvar com sucesso
 *   clear();
 */

import { useCallback } from "react";

const PREFIX = "erp:form:";

export function useFormPersist<T = Record<string, unknown>>(key: string) {
  const save = useCallback(
    (state: T) => {
      try {
        sessionStorage.setItem(PREFIX + key, JSON.stringify(state));
      } catch {}
    },
    [key]
  );

  const load = useCallback((): T | null => {
    try {
      const raw = sessionStorage.getItem(PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }, [key]);

  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(PREFIX + key);
    } catch {}
  }, [key]);

  return { save, load, clear };
}
