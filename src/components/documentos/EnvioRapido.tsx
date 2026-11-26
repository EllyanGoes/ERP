"use client";

// Envio rápido de VÁRIOS arquivos (padrão Drive): cada arquivo vira um
// documento na pasta escolhida, com título = nome do arquivo sem extensão.
// Validade/responsável/tags são opcionais e valem para o lote. Pasta que exige
// validade não bloqueia: o documento entra marcado "Falta validade".
// Envia um por vez (limite de ~4,5 MB por requisição na Vercel) com progresso.
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Folder, Loader2, UploadCloud, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import DatePicker from "@/components/shared/DatePicker";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import ModalPortal from "@/components/shared/ModalPortal";
import { cn } from "@/lib/utils";
import { Modal } from "./Dialogos";
import PastaTree from "./PastaTree";
import {
  IconeArquivo, MSG_EXCEDE_ENVIO, enviarComProgresso, excedeEnvio, fmtBytes, type PastaDTO,
} from "./comum";

type ItemFila = { file: File; titulo: string; estado: "fila" | "enviando" | "ok" | "erro"; pct: number; erro?: string; id?: string };

export function tituloDoArquivo(nome: string): string {
  const i = nome.lastIndexOf(".");
  return (i > 0 ? nome.slice(0, i) : nome).trim() || nome;
}

export default function EnvioRapido({
  arquivos, pastaInicial, pastas, onFechar, onConcluido,
}: {
  arquivos: File[];
  pastaInicial: string | null;
  pastas: PastaDTO[];
  onFechar: () => void;
  /** Chamado ao fim do lote (recarregar a lista). */
  onConcluido: () => void;
}) {
  const [fase, setFase] = useState<"config" | "envio">("config");
  const [pastaId, setPastaId] = useState<string | null>(pastaInicial);
  const [trocarPasta, setTrocarPasta] = useState(!pastaInicial);
  const [validade, setValidade] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [tags, setTags] = useState("");
  const [usuarios, setUsuarios] = useState<{ id: string; nome: string }[]>([]);
  const [fila, setFila] = useState<ItemFila[]>(() => arquivos.map((f) => ({
    file: f, titulo: tituloDoArquivo(f.name), estado: "fila", pct: 0,
    ...(excedeEnvio(f) ? { estado: "erro" as const, erro: MSG_EXCEDE_ENVIO } : {}),
  })));
  const [minimizado, setMinimizado] = useState(false);
  const [erro, setErro] = useState("");
  const enviandoRef = useRef(false);

  useEffect(() => {
    fetch("/api/documentos/lookups").then((r) => r.json()).then((j) => setUsuarios(j.data?.usuarios ?? [])).catch(() => {});
  }, []);

  const pasta = pastas.find((p) => p.id === pastaId) ?? null;
  const ativas = useMemo(() => pastas.filter((p) => p.ativo), [pastas]);
  const validos = fila.filter((i) => i.estado !== "erro" || i.erro !== MSG_EXCEDE_ENVIO);
  const grandes = fila.length - validos.length;
  const terminou = fase === "envio" && fila.every((i) => i.estado === "ok" || i.estado === "erro");
  const nOk = fila.filter((i) => i.estado === "ok").length;
  const nErro = fila.filter((i) => i.estado === "erro").length;
  const atual = fila.find((i) => i.estado === "enviando");

  // Aviso ao sair da página no meio do envio.
  useEffect(() => {
    if (fase !== "envio" || terminou) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [fase, terminou]);

  function atualizar(idx: number, p: Partial<ItemFila>) {
    setFila((prev) => prev.map((it, i) => (i === idx ? { ...it, ...p } : it)));
  }

  async function enviar() {
    if (!pastaId) { setErro("Escolha a pasta de destino."); return; }
    if (validos.length === 0) { setErro("Nenhum arquivo dentro do limite de envio."); return; }
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    setErro("");
    setFase("envio");
    for (let i = 0; i < fila.length; i++) {
      const it = fila[i];
      if (it.estado === "erro") continue;
      atualizar(i, { estado: "enviando", pct: 0 });
      const fd = new FormData();
      fd.set("file", it.file);
      fd.set("titulo", it.titulo.trim() || it.file.name);
      fd.set("categoriaId", pastaId);
      fd.set("rapido", "true");
      if (validade) fd.set("validade", validade);
      if (responsavelId) fd.set("responsavelId", responsavelId);
      if (tags.trim()) fd.set("tags", tags);
      const r = await enviarComProgresso("/api/documentos", fd, (pct) => atualizar(i, { pct }));
      if (r.ok) atualizar(i, { estado: "ok", pct: 100, id: r.json.data?.id });
      else atualizar(i, { estado: "erro", erro: r.status === 413 ? MSG_EXCEDE_ENVIO : r.json.error || "Falha no envio." });
    }
    enviandoRef.current = false;
    onConcluido();
  }

  // ── Fase 1: confirmar destino e dados opcionais ────────────────────────────
  if (fase === "config") {
    return (
      <Modal
        titulo={`Enviar ${fila.length} arquivo${fila.length > 1 ? "s" : ""}`}
        onFechar={onFechar}
        largura="max-w-lg"
        rodape={<>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={enviar} disabled={!pastaId || validos.length === 0}>
            <UploadCloud className="w-4 h-4 mr-2" /> Enviar{validos.length !== fila.length ? ` ${validos.length}` : ""}
          </Button>
        </>}
      >
        <div className="space-y-4">
          {/* Destino */}
          <div className="space-y-1.5">
            <Label>Pasta de destino</Label>
            {trocarPasta ? (
              <div className="border border-border rounded-lg p-1.5 h-56 overflow-y-auto">
                <PastaTree pastas={ativas} selecionada={pastaId} onSelecionar={(id) => { setPastaId(id); }} />
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <Folder className="w-4 h-4 text-warning" />
                <span className="font-medium text-foreground">{pasta?.caminho ?? "—"}</span>
                <button onClick={() => setTrocarPasta(true)} className="text-xs text-primary hover:underline ml-1">trocar</button>
              </div>
            )}
            {pasta?.exigeValidade && !validade && (
              <p className="text-xs text-warning flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                Esta pasta exige validade. Sem data, os documentos entram marcados &quot;Falta validade&quot; para completar depois.
              </p>
            )}
          </div>

          {/* Arquivos */}
          <div className="border border-border rounded-lg divide-y divide-border max-h-48 overflow-y-auto">
            {fila.map((it, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                <IconeArquivo mime={it.file.type} nome={it.file.name} />
                <Input
                  value={it.titulo}
                  onChange={(e) => atualizar(i, { titulo: e.target.value })}
                  className="h-7 text-sm border-transparent hover:border-border focus:border-border px-1.5"
                  disabled={it.estado === "erro"}
                  title="Título do documento"
                />
                <span className={cn("text-[11px] shrink-0", it.estado === "erro" ? "text-danger" : "text-muted-foreground")}>{fmtBytes(it.file.size)}</span>
                <button onClick={() => setFila((p) => p.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground shrink-0" title="Tirar da lista">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          {grandes > 0 && <p className="text-xs text-danger">{grandes} arquivo{grandes > 1 ? "s" : ""} acima do limite (ficam de fora). {MSG_EXCEDE_ENVIO}</p>}

          {/* Opcionais (valem para todos) */}
          <details className="group">
            <summary className="text-sm text-muted-foreground cursor-pointer select-none hover:text-foreground">
              Validade, responsável e tags <span className="text-xs">(opcional — vale para todos)</span>
            </summary>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="space-y-1.5">
                <Label>Validade</Label>
                <DatePicker value={validade} onChange={setValidade} />
              </div>
              <div className="space-y-1.5">
                <Label>Responsável</Label>
                <ComboboxWithCreate
                  value={responsavelId}
                  onChange={setResponsavelId}
                  noneLabel="— Ninguém —"
                  triggerClassName="h-9 rounded-lg"
                  menuMinWidth={260}
                  options={usuarios.map((u) => ({ value: u.id, label: u.nome }))}
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Tags</Label>
                <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="separadas por vírgula" />
              </div>
            </div>
          </details>

          {erro && <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{erro}</p>}
        </div>
      </Modal>
    );
  }

  // ── Fase 2: painel de progresso (canto inferior direito, não bloqueia) ─────
  return (
    <ModalPortal>
      <div className="fixed bottom-4 right-4 z-[9998] w-[360px] max-w-[calc(100vw-2rem)] bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 h-11 bg-muted border-b border-border">
          {terminou
            ? nErro > 0 ? <AlertTriangle className="w-4 h-4 text-warning" /> : <CheckCircle2 className="w-4 h-4 text-success" />
            : <Loader2 className="w-4 h-4 animate-spin text-primary" />}
          <span className="text-sm font-medium text-foreground truncate">
            {terminou
              ? `${nOk} enviado${nOk === 1 ? "" : "s"}${nErro ? ` · ${nErro} com falha` : ""}`
              : `Enviando ${fila.filter((i) => i.estado === "ok").length + 1} de ${validos.length}…`}
          </span>
          <button onClick={() => setMinimizado((v) => !v)} className="ml-auto text-muted-foreground hover:text-foreground" title={minimizado ? "Expandir" : "Recolher"}>
            {minimizado ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {terminou && <button onClick={onFechar} className="text-muted-foreground hover:text-foreground" title="Fechar"><X className="w-4 h-4" /></button>}
        </div>
        {!minimizado && (
          <div className="max-h-72 overflow-y-auto divide-y divide-border">
            {fila.map((it, i) => (
              <div key={i} className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <IconeArquivo mime={it.file.type} nome={it.file.name} />
                  <span className="text-sm text-foreground truncate flex-1" title={it.file.name}>{it.titulo}</span>
                  {it.estado === "ok" && <CheckCircle2 className="w-4 h-4 text-success shrink-0" />}
                  {it.estado === "erro" && <XCircle className="w-4 h-4 text-danger shrink-0" />}
                  {it.estado === "enviando" && <span className="text-[11px] text-muted-foreground shrink-0">{it.pct}%</span>}
                  {it.estado === "fila" && <span className="text-[11px] text-muted-foreground shrink-0">na fila</span>}
                </div>
                {it.estado === "enviando" && (
                  <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${Math.max(4, it === atual ? it.pct : 0)}%` }} />
                  </div>
                )}
                {it.estado === "erro" && <p className="text-[11px] text-danger mt-0.5">{it.erro}</p>}
              </div>
            ))}
          </div>
        )}
        {terminou && !minimizado && pasta && (
          <div className="px-4 py-2 border-t border-border text-[11px] text-muted-foreground">
            Em <span className="text-foreground">{pasta.caminho}</span>
            {pasta.exigeValidade && !validade && nOk > 0 && " · marcados \"Falta validade\""}
          </div>
        )}
      </div>
    </ModalPortal>
  );
}
