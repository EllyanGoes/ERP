"use client";

// Ativo em tela própria ("Abrir em janela" do popup da árvore). Mesmo
// componente do popup, com o formulário de edição/novo filho embutido.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import AtivoPainel from "../AtivoPainel";
import AtivoFormDialog, { type AtivoFicha, type Lookups } from "../AtivoFormDialog";
import type { AtivoNode } from "@/app/api/pcm/ativos/route";

export default function AtivoPage() {
  const { codApl } = useParams<{ codApl: string }>();
  const cod = Number(codApl);
  const router = useRouter();
  const [versao, setVersao] = useState(0);

  const [tree, setTree] = useState<AtivoNode[]>([]);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<AtivoFicha | null>(null);
  const [paiInicial, setPaiInicial] = useState<string | null>(null);

  // Árvore e listas só são necessárias quando o formulário abre.
  const carregarApoio = useCallback(() => {
    fetch("/api/pcm/ativos").then((r) => (r.ok ? r.json() : null)).then((j) => j && setTree(j.tree ?? [])).catch(() => {});
    if (!lookups) {
      fetch("/api/pcm/ativos/lookups").then((r) => (r.ok ? r.json() : null)).then((j) => j && setLookups(j.data)).catch(() => {});
    }
  }, [lookups]);
  useEffect(() => { if (formAberto) carregarApoio(); }, [formAberto]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!Number.isInteger(cod) || cod <= 0) {
    return <p className="p-8 text-sm text-danger">Ativo inválido.</p>;
  }

  return (
    <div>
      <div className="px-8 pt-4">
        <Link href="/pcm/ativos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-4 h-4" /> Ativos
        </Link>
      </div>
      <AtivoPainel
        codApl={cod}
        versao={versao}
        modo="pagina"
        onFechar={() => router.push("/pcm/ativos")}
        onEditar={(a) => { setEditando(a); setPaiInicial(null); setFormAberto(true); }}
        onNovoFilho={(paiId) => { setEditando(null); setPaiInicial(paiId); setFormAberto(true); }}
        onAlterado={() => setVersao((v) => v + 1)}
      />
      <AtivoFormDialog
        open={formAberto}
        onOpenChange={setFormAberto}
        editando={editando}
        paiInicial={paiInicial}
        tree={tree}
        lookups={lookups}
        onSalvo={(novo) => {
          if (novo !== cod) router.push(`/pcm/ativos/${novo}`);
          else setVersao((v) => v + 1);
        }}
      />
    </div>
  );
}
