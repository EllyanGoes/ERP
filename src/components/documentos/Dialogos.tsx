"use client";

// Diálogos pequenos do GED: nome (nova pasta / renomear), mover para pasta e
// confirmação. Modais artesanais com EscClose e portal (ficam acima do viewer).
import { useState, type ReactNode } from "react";
import { Loader2, X, FolderInput } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import EscClose from "@/components/shared/EscClose";
import ModalPortal from "@/components/shared/ModalPortal";
import PastaTree from "./PastaTree";
import type { PastaDTO } from "./comum";

export function Modal({ titulo, onFechar, children, rodape, largura = "max-w-md", bloqueado }: {
  titulo: ReactNode;
  onFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: string;
  bloqueado?: boolean;
}) {
  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
        onMouseDown={(e) => { if (e.target === e.currentTarget && !bloqueado) onFechar(); }}
      >
        <EscClose onClose={() => { if (!bloqueado) onFechar(); }} />
        <div className={`bg-card rounded-2xl shadow-2xl w-full ${largura} flex flex-col max-h-[90vh]`}>
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
            <h2 className="font-semibold text-foreground">{titulo}</h2>
            <button onClick={onFechar} disabled={bloqueado} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
          </div>
          <div className="px-5 py-4 overflow-y-auto">{children}</div>
          {rodape && <div className="px-5 py-3 border-t border-border bg-muted rounded-b-2xl flex justify-end gap-2">{rodape}</div>}
        </div>
      </div>
    </ModalPortal>
  );
}

/** Nome de pasta/documento. Em "nova pasta" mostra também as regras de validade. */
export function NomeDialog({
  titulo, rotulo = "Nome", inicial = "", confirmar = "Salvar", onFechar, onSalvar, comRegras, regrasIniciais,
}: {
  titulo: string;
  rotulo?: string;
  inicial?: string;
  confirmar?: string;
  onFechar: () => void;
  onSalvar: (nome: string, regras?: { exigeValidade: boolean; diasAlerta: number }) => Promise<string | null>;
  comRegras?: boolean;
  regrasIniciais?: { exigeValidade: boolean; diasAlerta: number };
}) {
  const [nome, setNome] = useState(inicial);
  const [exige, setExige] = useState(regrasIniciais?.exigeValidade ?? false);
  const [dias, setDias] = useState(String(regrasIniciais?.diasAlerta ?? 30));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    if (!nome.trim()) { setErro("Informe o nome."); return; }
    setSalvando(true); setErro("");
    const e = await onSalvar(nome.trim(), comRegras ? { exigeValidade: exige, diasAlerta: parseInt(dias) || 30 } : undefined);
    setSalvando(false);
    if (e) setErro(e); else onFechar();
  }

  return (
    <Modal
      titulo={titulo}
      onFechar={onFechar}
      bloqueado={salvando}
      rodape={<>
        <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
        <Button onClick={salvar} disabled={salvando}>
          {salvando && <Loader2 className="w-4 h-4 animate-spin mr-2" />}{confirmar}
        </Button>
      </>}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>{rotulo}</Label>
          <Input
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onFocus={(e) => {
              // Renomear arquivo: seleciona só o nome (como o Drive)
              const v = e.target.value;
              const ponto = v.lastIndexOf(".");
              e.target.setSelectionRange(0, ponto > 0 && v.length - ponto <= 5 ? ponto : v.length);
            }}
            onKeyDown={(e) => { if (e.key === "Enter") salvar(); }}
          />
        </div>
        {comRegras && (
          <div className="rounded-lg border border-border p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={exige} onChange={(e) => setExige(e.target.checked)} className="rounded" />
              Documentos desta pasta exigem validade
            </label>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              Alertar
              <Input type="number" min={0} value={dias} onChange={(e) => setDias(e.target.value)} className="h-8 w-20" />
              dias antes do vencimento
            </div>
            <p className="text-[11px] text-muted-foreground">Padrão copiado da pasta de cima; dá para mudar depois.</p>
          </div>
        )}
        {erro && <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{erro}</p>}
      </div>
    </Modal>
  );
}

/** Escolha da pasta de destino (árvore). */
export function MoverDialog({
  titulo, pastas, atual, bloquear, permitirRaiz, onFechar, onMover, confirmar = "Mover aqui",
}: {
  titulo: string;
  pastas: PastaDTO[];
  /** Pasta onde o item está hoje (pré-selecionada). */
  atual: string | null;
  /** Ids que não podem ser destino (a própria pasta e descendentes). */
  bloquear?: Set<string>;
  /** Pastas podem ir para a raiz; documentos não. */
  permitirRaiz?: boolean;
  onFechar: () => void;
  onMover: (destino: string | null) => Promise<string | null>;
  confirmar?: string;
}) {
  const [destino, setDestino] = useState<string | null>(atual);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const ativas = pastas.filter((p) => p.ativo);
  const caminho = destino ? pastas.find((p) => p.id === destino)?.caminho : "Acervo (raiz)";

  async function mover() {
    if (!permitirRaiz && !destino) { setErro("Escolha uma pasta."); return; }
    setSalvando(true); setErro("");
    const e = await onMover(destino);
    setSalvando(false);
    if (e) setErro(e); else onFechar();
  }

  return (
    <Modal
      titulo={titulo}
      onFechar={onFechar}
      bloqueado={salvando}
      rodape={<>
        <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
        <Button onClick={mover} disabled={salvando || destino === atual}>
          {salvando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FolderInput className="w-4 h-4 mr-2" />}{confirmar}
        </Button>
      </>}
    >
      <div className="space-y-3">
        <div className="border border-border rounded-lg p-1.5 h-80 overflow-y-auto">
          <PastaTree
            pastas={ativas}
            selecionada={destino}
            onSelecionar={setDestino}
            desabilitadas={permitirRaiz ? bloquear : new Set(Array.from(bloquear ?? []).concat("__raiz__"))}
            mostrarRaiz={permitirRaiz}
          />
        </div>
        <p className="text-xs text-muted-foreground">Destino: <span className="text-foreground font-medium">{caminho ?? "—"}</span></p>
        {erro && <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{erro}</p>}
      </div>
    </Modal>
  );
}

export function ConfirmarDialog({
  titulo, texto, confirmar = "Confirmar", perigo, onFechar, onConfirmar,
}: {
  titulo: string;
  texto: ReactNode;
  confirmar?: string;
  perigo?: boolean;
  onFechar: () => void;
  onConfirmar: () => Promise<string | null>;
}) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  async function ok() {
    setSalvando(true); setErro("");
    const e = await onConfirmar();
    setSalvando(false);
    if (e) setErro(e); else onFechar();
  }
  return (
    <Modal
      titulo={titulo}
      onFechar={onFechar}
      bloqueado={salvando}
      largura="max-w-sm"
      rodape={<>
        <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
        <Button onClick={ok} disabled={salvando} className={perigo ? "bg-red-600 hover:bg-red-700 text-white" : undefined}>
          {salvando && <Loader2 className="w-4 h-4 animate-spin mr-2" />}{confirmar}
        </Button>
      </>}
    >
      <div className="text-sm text-muted-foreground space-y-2">{texto}</div>
      {erro && <p className="mt-3 text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{erro}</p>}
    </Modal>
  );
}
