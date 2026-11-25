"use client";

// Minhas Aprovações no topo, ao lado da Caixa de Entrada e do sino: ícone com
// a quantidade pendente (cotações, pedidos alterados, exclusões). Antes ficava
// no menu de Compras. Atualiza a cada 60s, só com a aba visível.
import { useCallback, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ThumbsUp } from "lucide-react";
import { useDirtyFormContext } from "@/lib/dirty-form-context";
import { usePollingVisivel } from "@/lib/use-polling-visivel";
import { cn } from "@/lib/utils";

export default function AprovacoesButton() {
  const router = useRouter();
  const pathname = usePathname();
  const { attemptNavigate } = useDirtyFormContext();
  const [pendentes, setPendentes] = useState(0);

  const carregar = useCallback(async () => {
    try {
      const [res, exc] = await Promise.all([
        fetch("/api/aprovacoes?status=PENDENTE&limit=1"),
        fetch("/api/aprovacoes/exclusoes?status=PENDENTE"),
      ]);
      const n1 = res.ok ? ((await res.json()).pendingCount ?? 0) : 0;
      const n2 = exc.ok ? ((await exc.json()).pendingCount ?? 0) : 0;
      setPendentes(n1 + n2);
    } catch { /* ignore */ }
  }, []);

  usePollingVisivel(carregar, 60_000);

  const ativo = pathname.startsWith("/aprovacoes");
  return (
    <button
      type="button"
      onClick={() => attemptNavigate(() => router.push("/aprovacoes"))}
      className={cn(
        "relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
        ativo ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      title={pendentes > 0 ? `Minhas aprovações · ${pendentes} pendente${pendentes > 1 ? "s" : ""}` : "Minhas aprovações"}
      aria-label="Minhas aprovações"
    >
      <ThumbsUp className="w-[18px] h-[18px]" />
      {pendentes > 0 && (
        <span className="absolute top-0.5 right-0.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-amber-500 px-[3px] text-[9px] font-bold leading-none text-white ring-1 ring-background tabular-nums">
          {pendentes > 9 ? "9+" : pendentes}
        </span>
      )}
    </button>
  );
}
