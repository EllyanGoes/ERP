"use client";

// Acervo de documentos no PADRÃO DE NAVEGAÇÃO do Drive (visual do ERP):
// pastas/subpastas de verdade, breadcrumb com a pasta na URL (?pasta=),
// lista/grade, filtros em chips (com filtro ou busca → resultados de todas as
// pastas), visualização em overlay, menu ⋮/clique direito, arrastar e soltar
// (arquivos do computador = envio rápido; documento/pasta sobre pasta = mover)
// e estrela por usuário. Visões: Acervo, Recentes, Com estrela.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive, ArrowDown, ArrowUp, ChevronDown, ChevronRight, Clock, Download, ExternalLink, Eye, FilePlus2,
  FileUp, Folder, FolderInput, FolderOpen, FolderPlus, LayoutGrid, LayoutList, Loader2, Lock, MoreVertical,
  PanelLeft, Pencil, Plus, Power, Search, Star, Trash2, UploadCloud, X, RefreshCw, FileWarning,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import FilterDropdown from "@/components/shared/FilterDropdown";
import { CHIP_TRIGGER, FilterBarChips, FilterBarToggle, useFilterBar, type FiltroChip } from "@/components/shared/FilterBar";
import { usePersistedState, useSessionState } from "@/lib/use-persisted-state";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import {
  IconeArquivo, SITUACAO_LABEL, SituacaoBadge, TIPO_ARQUIVO_LABEL, fmtBytes, fmtDataCurta, situacaoDoc, tipoArquivo,
  type DocumentoListaDTO, type PastaDTO, type Situacao, type TipoArquivo,
} from "./comum";
import PastaTree, { ancestrais, descendentes, filhasDe } from "./PastaTree";
import DocumentoDetalhe from "./DocumentoDetalhe";
import DocumentoCreateDrawer from "./DocumentoCreateDrawer";
import EnvioRapido from "./EnvioRapido";
import NovaVersaoDialog from "./NovaVersaoDialog";
import { ConfirmarDialog, MoverDialog, NomeDialog } from "./Dialogos";

export type VisaoDocumentos = "acervo" | "recentes" | "estrela";

type Resumo = { VENCIDO: number; VENCE_EM_BREVE: number; EM_RENOVACAO: number; FALTA_VALIDADE: number; total: number };
type Coluna = "nome" | "local" | "situacao" | "validade" | "responsavel" | "modificado" | "tamanho";
type Ordem = { col: Coluna; dir: "asc" | "desc" };
type Alvo = { tipo: "doc"; doc: DocumentoListaDTO } | { tipo: "pasta"; pasta: PastaDTO } | { tipo: "vazio" };
type Dialogo =
  | { tipo: "novaPasta"; paiId: string | null }
  | { tipo: "renomearPasta"; pasta: PastaDTO }
  | { tipo: "moverPasta"; pasta: PastaDTO }
  | { tipo: "excluirPasta"; pasta: PastaDTO }
  | { tipo: "renomearDoc"; doc: DocumentoListaDTO }
  | { tipo: "moverDoc"; doc: DocumentoListaDTO }
  | { tipo: "excluirDoc"; doc: DocumentoListaDTO }
  | { tipo: "versaoDoc"; doc: DocumentoListaDTO };

const ORDEM_SITUACAO: Record<Situacao, number> = {
  VENCIDO: 0, FALTA_VALIDADE: 1, VENCE_EM_BREVE: 2, EM_RENOVACAO: 3, VIGENTE: 4, SEM_VALIDADE: 5, ARQUIVADO: 6,
};
const MODIFICADO_OPCOES = [
  { key: "1", label: "Hoje" },
  { key: "7", label: "Últimos 7 dias" },
  { key: "30", label: "Últimos 30 dias" },
  { key: "365", label: "Últimos 12 meses" },
];
const MIME_DOC = "application/x-erp-documento";
const MIME_PASTA = "application/x-erp-pasta";

function temArquivos(dt: DataTransfer): boolean {
  return Array.from(dt.types).includes("Files");
}

export default function DocumentosExplorer({ visao }: { visao: VisaoDocumentos }) {
  const router = useRouter();
  const sp = useSearchParams();
  const pastaAtual = visao === "acervo" ? sp.get("pasta") : null;
  useTabTitle(visao === "recentes" ? "Documentos recentes" : visao === "estrela" ? "Documentos com estrela" : "Documentos");

  const [pastas, setPastas] = useState<PastaDTO[]>([]);
  const [docs, setDocs] = useState<DocumentoListaDTO[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [usuarios, setUsuarios] = useState<{ id: string; nome: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const [busca, setBusca] = useSessionState<string>(`documentos:${visao}:busca`, "");
  const [layout, setLayout] = usePersistedState<"lista" | "grade">("documentos:layout", "lista");
  const [ordem, setOrdem] = usePersistedState<Ordem>("documentos:ordem", { col: "nome", dir: "asc" });
  const [arvore, setArvore] = usePersistedState<boolean>("documentos:arvore", true);
  const [fTipo, setFTipo] = usePersistedState<string>(`documentos:${visao}:ftipo`, "");
  const [fSituacao, setFSituacao] = usePersistedState<string>(`documentos:${visao}:fsituacao`, "");
  const [fResp, setFResp] = usePersistedState<string>(`documentos:${visao}:fresp`, "");
  const [fModif, setFModif] = usePersistedState<string>(`documentos:${visao}:fmodif`, "");
  const bar = useFilterBar(`documentos:${visao}:filtros`, ["tipo", "situacao"]);

  const [viewerId, setViewerId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; alvo: Alvo } | null>(null);
  const [menuNovo, setMenuNovo] = useState(false);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [envio, setEnvio] = useState<File[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [arrastandoArquivos, setArrastandoArquivos] = useState(false);
  /** Pasta de destino do próximo envio (undefined = pasta aberta). */
  const [envioPasta, setEnvioPasta] = useState<string | null | undefined>(undefined);
  const [alvoDrop, setAlvoDrop] = useState<string | null>(null);
  const profundidadeDrag = useRef(0);
  const inputArquivos = useRef<HTMLInputElement>(null);

  const chipsAtivos = !!(fTipo || fSituacao || fResp || fModif);
  const global = visao === "acervo" && (!!busca.trim() || chipsAtivos);
  const pastaObj = pastas.find((p) => p.id === pastaAtual) ?? null;

  // ── Carga ──────────────────────────────────────────────────────────────────
  const carregarPastas = useCallback(async () => {
    const j = await fetch("/api/documentos/categorias").then((r) => r.json()).catch(() => null);
    if (j?.data) setPastas(j.data);
  }, []);
  const carregarResumo = useCallback(async () => {
    const j = await fetch("/api/documentos/resumo").then((r) => r.json()).catch(() => null);
    if (j?.data) setResumo(j.data);
  }, []);

  const carregarDocs = useCallback(async () => {
    const p = new URLSearchParams();
    if (visao === "recentes") p.set("visao", "recentes");
    else if (visao === "estrela") p.set("visao", "estrela");
    else if (!global) {
      if (!pastaAtual) { setDocs([]); setLoading(false); return; } // raiz: só pastas
      p.set("pasta", pastaAtual);
    }
    if (busca.trim()) p.set("busca", busca.trim());
    try {
      const res = await fetch(`/api/documentos?${p.toString()}`);
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro ao carregar"); return; }
      setDocs(json.data ?? []);
      setErro("");
    } catch {
      setErro("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }, [visao, global, pastaAtual, busca]);

  const recarregar = useCallback(() => { carregarDocs(); carregarPastas(); carregarResumo(); }, [carregarDocs, carregarPastas, carregarResumo]);

  useEffect(() => { carregarPastas(); carregarResumo(); }, [carregarPastas, carregarResumo]);
  useEffect(() => {
    fetch("/api/documentos/lookups").then((r) => r.json()).then((j) => setUsuarios(j.data?.usuarios ?? [])).catch(() => {});
  }, []);
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(carregarDocs, busca ? 300 : 0); // debounce da busca
    return () => clearTimeout(t);
  }, [carregarDocs, busca]);

  // Link antigo ?categoria=<slug|id> (ex.: obrigações do SST) → ?pasta=<id>
  useEffect(() => {
    const cat = sp.get("categoria");
    if (!cat || pastas.length === 0) return;
    const p = pastas.find((x) => x.slug === cat || x.id === cat);
    router.replace(p ? `/documentos?pasta=${p.id}` : "/documentos");
  }, [sp, pastas, router]);

  // ── Navegação ──────────────────────────────────────────────────────────────
  // Entrar numa pasta sai do modo "resultados" (como o Drive): limpa busca e chips.
  function abrirPasta(id: string | null) {
    setMenu(null);
    setBusca(""); setFTipo(""); setFSituacao(""); setFResp(""); setFModif("");
    router.push(id ? `/documentos?pasta=${id}` : "/documentos");
  }
  function abrirDoc(d: DocumentoListaDTO) {
    setMenu(null);
    setViewerId(d.id);
  }

  // ── Ações ──────────────────────────────────────────────────────────────────
  async function api(url: string, method: string, body?: unknown): Promise<string | null> {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => null);
    if (!res) return "Erro de conexão.";
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      return j?.error || "Não foi possível concluir.";
    }
    recarregar();
    return null;
  }
  async function avisar(p: Promise<string | null>) {
    const e = await p;
    setAviso(e ?? "");
  }
  async function alternarEstrela(d: DocumentoListaDTO) {
    setDocs((prev) => (visao === "estrela" && d.favorito
      ? prev.filter((x) => x.id !== d.id)
      : prev.map((x) => (x.id === d.id ? { ...x, favorito: !x.favorito } : x))));
    await fetch(`/api/documentos/${d.id}/favorito`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ favorito: !d.favorito }),
    }).catch(() => {});
  }
  function moverDoc(docId: string, pastaId: string) {
    return api(`/api/documentos/${docId}`, "PATCH", { categoriaId: pastaId });
  }
  function moverPasta(id: string, paiId: string | null) {
    return api(`/api/documentos/categorias/${id}`, "PATCH", { paiId });
  }
  function fimArraste() {
    profundidadeDrag.current = 0;
    setArrastandoArquivos(false);
    setAlvoDrop(null);
  }
  /** Soltar sobre uma pasta: documento/pasta = mover; arquivos = enviar para ela. */
  function soltarEm(pastaId: string | null, dt: DataTransfer) {
    fimArraste();
    const docId = dt.getData(MIME_DOC);
    const pId = dt.getData(MIME_PASTA);
    if (docId) { if (pastaId) avisar(moverDoc(docId, pastaId)); }
    else if (pId) { if (pId !== pastaId) avisar(moverPasta(pId, pastaId)); }
    else if (temArquivos(dt) && dt.files.length > 0) { setEnvioPasta(pastaId); setEnvio(Array.from(dt.files)); }
  }

  // ── Filtros e ordenação ────────────────────────────────────────────────────
  const docsFiltrados = useMemo(() => {
    const agora = Date.now();
    return docs.filter((d) => {
      if (fTipo && tipoArquivo(d.versaoVigente?.mime, d.versaoVigente?.nome) !== fTipo) return false;
      if (fSituacao && situacaoDoc(d) !== fSituacao) return false;
      if (fResp && (fResp === "__nenhum__" ? !!d.responsavel : d.responsavel?.id !== fResp)) return false;
      if (fModif) {
        const dias = parseInt(fModif);
        const ref = new Date(d.updatedAt ?? d.createdAt).getTime();
        if (dias === 1) { if (new Date(ref).toDateString() !== new Date().toDateString()) return false; }
        else if (agora - ref > dias * 86400000) return false;
      }
      return true;
    });
  }, [docs, fTipo, fSituacao, fResp, fModif]);

  const docsOrdenados = useMemo(() => {
    const m = ordem.dir === "asc" ? 1 : -1;
    const val = (d: DocumentoListaDTO): string | number => {
      switch (ordem.col) {
        case "nome": return d.titulo.toLocaleLowerCase("pt-BR");
        case "local": return (d.caminho ?? "").toLocaleLowerCase("pt-BR");
        case "situacao": return ORDEM_SITUACAO[situacaoDoc(d)];
        case "validade": return d.validade ? new Date(d.validade).getTime() : Number.MAX_SAFE_INTEGER;
        case "responsavel": return (d.responsavel?.nome ?? "￿").toLocaleLowerCase("pt-BR");
        case "modificado": return new Date(visao === "recentes" && d.ultimoAcesso ? d.ultimoAcesso : d.updatedAt ?? d.createdAt).getTime();
        case "tamanho": return d.versaoVigente?.tamanho ?? 0;
      }
    };
    // Recentes sem ordenação explícita: mais recente primeiro.
    return [...docsFiltrados].sort((a, b) => {
      const va = val(a), vb = val(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * m;
    });
  }, [docsFiltrados, ordem, visao]);

  const pastasVisiveis = useMemo(() => {
    if (visao !== "acervo" || global) return [];
    const lista = filhasDe(pastas, pastaAtual);
    if (ordem.col === "nome") {
      return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR") * (ordem.dir === "asc" ? 1 : -1));
    }
    return lista;
  }, [pastas, pastaAtual, visao, global, ordem]);

  function ordenarPor(col: Coluna) {
    setOrdem((o) => (o.col === col ? { col, dir: o.dir === "asc" ? "desc" : "asc" } : { col, dir: col === "modificado" ? "desc" : "asc" }));
  }

  const chips: FiltroChip[] = [
    {
      key: "tipo", label: "Tipo", icon: <FilePlus2 className="w-3.5 h-3.5" />, ativo: !!fTipo, limpar: () => setFTipo(""),
      render: () => (
        <FilterDropdown label="Tipo" value={fTipo} onChange={setFTipo} allKey="" triggerClassName={CHIP_TRIGGER}
          options={(Object.keys(TIPO_ARQUIVO_LABEL) as TipoArquivo[]).map((k) => ({ key: k, label: TIPO_ARQUIVO_LABEL[k] }))} />
      ),
    },
    {
      key: "situacao", label: "Situação", icon: <Clock className="w-3.5 h-3.5" />, ativo: !!fSituacao, limpar: () => setFSituacao(""),
      render: () => (
        <FilterDropdown label="Situação" value={fSituacao} onChange={setFSituacao} allKey="" triggerClassName={CHIP_TRIGGER}
          options={(Object.keys(SITUACAO_LABEL) as Situacao[]).map((k) => ({ key: k, label: SITUACAO_LABEL[k] }))} />
      ),
    },
    {
      key: "responsavel", label: "Responsável", icon: <Eye className="w-3.5 h-3.5" />, ativo: !!fResp, limpar: () => setFResp(""),
      render: () => (
        <FilterDropdown label="Responsável" value={fResp} onChange={setFResp} allKey="" triggerClassName={CHIP_TRIGGER}
          options={[{ key: "__nenhum__", label: "Sem responsável" }, ...usuarios.map((u) => ({ key: u.id, label: u.nome }))]} />
      ),
    },
    {
      key: "modificado", label: "Modificado", icon: <Pencil className="w-3.5 h-3.5" />, ativo: !!fModif, limpar: () => setFModif(""),
      render: () => (
        <FilterDropdown label="Modificado" value={fModif} onChange={setFModif} allKey="" triggerClassName={CHIP_TRIGGER} options={MODIFICADO_OPCOES} />
      ),
    },
  ];

  function limparTudo() {
    setBusca(""); setFTipo(""); setFSituacao(""); setFResp(""); setFModif("");
  }

  // ── Arrastar arquivos do computador ────────────────────────────────────────
  function onDragEnter(e: React.DragEvent) {
    if (!temArquivos(e.dataTransfer)) return;
    e.preventDefault();
    profundidadeDrag.current++;
    setArrastandoArquivos(true);
  }
  function onDragLeave(e: React.DragEvent) {
    if (!temArquivos(e.dataTransfer)) return;
    profundidadeDrag.current = Math.max(0, profundidadeDrag.current - 1);
    if (profundidadeDrag.current === 0) setArrastandoArquivos(false);
  }
  function onDragOver(e: React.DragEvent) {
    if (temArquivos(e.dataTransfer)) e.preventDefault();
  }
  function onDrop(e: React.DragEvent) {
    if (!temArquivos(e.dataTransfer)) return;
    e.preventDefault();
    fimArraste();
    setEnvioPasta(undefined);
    if (e.dataTransfer.files.length > 0) setEnvio(Array.from(e.dataTransfer.files));
  }

  // Alvo de soltar (pasta da lista / breadcrumb): documento, pasta ou arquivos.
  function propsAlvo(pastaId: string | null, chave: string) {
    return {
      onDragOver: (e: React.DragEvent) => {
        const t = Array.from(e.dataTransfer.types);
        if (t.includes(MIME_DOC) && !pastaId) return; // documento não vai para a raiz
        if (t.includes(MIME_DOC) || t.includes(MIME_PASTA) || t.includes("Files")) {
          e.preventDefault();
          e.stopPropagation();
          setAlvoDrop(chave);
        }
      },
      onDragLeave: () => setAlvoDrop((a) => (a === chave ? null : a)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        soltarEm(pastaId, e.dataTransfer);
      },
    };
  }
  function abrirMenu(e: React.MouseEvent, alvo: Alvo) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, alvo });
  }

  // ── Render: pedaços ────────────────────────────────────────────────────────
  const trilha = ancestrais(pastas, pastaAtual);
  const titulo = visao === "recentes" ? "Recentes" : visao === "estrela" ? "Com estrela" : "Documentos";
  const mostrarLocal = visao !== "acervo" || global;
  const vazio = !loading && pastasVisiveis.length === 0 && docsOrdenados.length === 0;
  const destinoEnvio = envioPasta !== undefined ? envioPasta : global ? null : pastaAtual;

  const selo = (k: Situacao, rotulo: string, n: number, cls: string) => (
    <button
      type="button"
      onClick={() => setFSituacao(fSituacao === k ? "" : k)}
      className={cn(
        "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-xs transition-colors",
        fSituacao === k ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted",
        n === 0 && fSituacao !== k && "opacity-60",
      )}
    >
      <span className={cn("font-semibold tabular-nums", n > 0 && cls)}>{n}</span> {rotulo}
    </button>
  );

  const cabecalho = (col: Coluna, rotulo: string, cls?: string) => (
    <th className={cn("px-3 py-2 font-medium text-muted-foreground text-left whitespace-nowrap", cls)}>
      <button type="button" onClick={() => ordenarPor(col)} className="inline-flex items-center gap-1 hover:text-foreground">
        {rotulo}
        {ordem.col === col && (ordem.dir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </button>
    </th>
  );

  const nomeDoc = (d: DocumentoListaDTO) => (
    <span className="flex items-center gap-2 min-w-0">
      <IconeArquivo mime={d.versaoVigente?.mime} nome={d.versaoVigente?.nome} />
      <span className="truncate text-foreground font-medium" title={d.titulo}>{d.titulo}</span>
      {d.favorito && <Star className="w-3 h-3 shrink-0 fill-warning text-warning" />}
      {d.confidencial && <Lock className="w-3 h-3 shrink-0 text-muted-foreground" aria-label="Confidencial" />}
      {!d.arquivoOk && <FileWarning className="w-3 h-3 shrink-0 text-danger" aria-label="Arquivo não encontrado no Drive" />}
      {d.status === "EM_RENOVACAO" && <RefreshCw className="w-3 h-3 shrink-0 text-info" />}
    </span>
  );

  const validadeTxt = (d: DocumentoListaDTO) => {
    if (!d.validade) return <span className="text-muted-foreground/50">—</span>;
    const st = situacaoDoc(d);
    return (
      <span className={cn(st === "VENCIDO" ? "text-danger font-semibold" : st === "VENCE_EM_BREVE" ? "text-warning font-semibold" : "text-foreground")}>
        {new Date(d.validade).toLocaleDateString("pt-BR")}
      </span>
    );
  };

  const botaoMenu = (alvo: Alvo) => (
    <button
      type="button"
      onClick={(e) => abrirMenu(e, alvo)}
      className="h-7 w-7 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted opacity-60 group-hover:opacity-100"
      title="Mais ações"
    >
      <MoreVertical className="w-4 h-4" />
    </button>
  );

  const lista = (
    <div className="bg-card rounded-xl border border-border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted border-b border-border">
          <tr>
            {cabecalho("nome", "Nome", "pl-4")}
            {mostrarLocal && cabecalho("local", "Local", "hidden md:table-cell")}
            {cabecalho("situacao", "Situação")}
            {cabecalho("validade", "Validade", "hidden sm:table-cell")}
            {cabecalho("responsavel", "Responsável", "hidden lg:table-cell")}
            {cabecalho("modificado", visao === "recentes" ? "Aberto em" : "Modificado", "hidden lg:table-cell")}
            {cabecalho("tamanho", "Tamanho", "hidden md:table-cell text-right")}
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {pastasVisiveis.map((p) => (
            <tr
              key={p.id}
              draggable={!p.sistema}
              onDragStart={(e) => { e.dataTransfer.setData(MIME_PASTA, p.id); e.dataTransfer.effectAllowed = "move"; }}
              {...propsAlvo(p.id, `p:${p.id}`)}
              onClick={() => abrirPasta(p.id)}
              onContextMenu={(e) => abrirMenu(e, { tipo: "pasta", pasta: p })}
              className={cn("group hover:bg-muted cursor-pointer", alvoDrop === `p:${p.id}` && "bg-primary/10 outline outline-2 outline-primary/40", !p.ativo && "opacity-60")}
            >
              <td className="pl-4 pr-3 py-2">
                <span className="flex items-center gap-2 min-w-0">
                  <Folder className="w-4 h-4 shrink-0 text-warning fill-warning/20" />
                  <span className="truncate text-foreground font-medium">{p.nome}</span>
                  {!p.ativo && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">inativa</span>}
                  {p.exigeValidade && <span className="text-[10px] text-muted-foreground hidden xl:inline" title="Documentos desta pasta exigem validade">· exige validade</span>}
                </span>
              </td>
              {mostrarLocal && <td className="hidden md:table-cell" />}
              <td className="px-3 py-2 text-muted-foreground/50">—</td>
              <td className="px-3 py-2 hidden sm:table-cell" />
              <td className="px-3 py-2 hidden lg:table-cell" />
              <td className="px-3 py-2 hidden lg:table-cell" />
              <td className="px-3 py-2 hidden md:table-cell text-right text-xs text-muted-foreground whitespace-nowrap">
                {p.nDocumentos + p.nSubpastas} {p.nDocumentos + p.nSubpastas === 1 ? "item" : "itens"}
              </td>
              <td className="pr-2 text-right" onClick={(e) => e.stopPropagation()}>{botaoMenu({ tipo: "pasta", pasta: p })}</td>
            </tr>
          ))}
          {docsOrdenados.map((d) => (
            <tr
              key={d.id}
              draggable
              onDragStart={(e) => { e.dataTransfer.setData(MIME_DOC, d.id); e.dataTransfer.effectAllowed = "move"; }}
              onClick={() => abrirDoc(d)}
              onContextMenu={(e) => abrirMenu(e, { tipo: "doc", doc: d })}
              className="group hover:bg-muted cursor-pointer"
            >
              <td className="pl-4 pr-3 py-2 max-w-[28rem]">
                {nomeDoc(d)}
                {(d.numero || d.emissor) && (
                  <span className="block text-[11px] text-muted-foreground truncate pl-6">{[d.numero && `nº ${d.numero}`, d.emissor].filter(Boolean).join(" · ")}</span>
                )}
              </td>
              {mostrarLocal && (
                <td className="px-3 py-2 hidden md:table-cell text-xs" onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => abrirPasta(d.categoria.id)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary max-w-[16rem]" title="Abrir a pasta">
                    <Folder className="w-3 h-3 shrink-0" /><span className="truncate">{d.caminho ?? d.categoria.nome}</span>
                  </button>
                </td>
              )}
              <td className="px-3 py-2"><SituacaoBadge situacao={situacaoDoc(d)} /></td>
              <td className="px-3 py-2 hidden sm:table-cell whitespace-nowrap">{validadeTxt(d)}</td>
              <td className="px-3 py-2 hidden lg:table-cell text-xs text-muted-foreground truncate max-w-[10rem]">{d.responsavel?.nome ?? "—"}</td>
              <td className="px-3 py-2 hidden lg:table-cell text-xs text-muted-foreground whitespace-nowrap">
                {fmtDataCurta(visao === "recentes" && d.ultimoAcesso ? d.ultimoAcesso : d.updatedAt ?? d.createdAt)}
              </td>
              <td className="px-3 py-2 hidden md:table-cell text-right text-xs text-muted-foreground whitespace-nowrap">{d.versaoVigente ? fmtBytes(d.versaoVigente.tamanho) : "—"}</td>
              <td className="pr-2 text-right" onClick={(e) => e.stopPropagation()}>{botaoMenu({ tipo: "doc", doc: d })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const grade = (
    <div className="space-y-5">
      {pastasVisiveis.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Pastas</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
            {pastasVisiveis.map((p) => (
              <div
                key={p.id}
                draggable={!p.sistema}
                onDragStart={(e) => { e.dataTransfer.setData(MIME_PASTA, p.id); e.dataTransfer.effectAllowed = "move"; }}
                {...propsAlvo(p.id, `p:${p.id}`)}
                onClick={() => abrirPasta(p.id)}
                onContextMenu={(e) => abrirMenu(e, { tipo: "pasta", pasta: p })}
                className={cn(
                  "group flex items-center gap-2.5 h-12 pl-3 pr-1 rounded-xl border border-border bg-card hover:bg-muted cursor-pointer",
                  alvoDrop === `p:${p.id}` && "bg-primary/10 border-primary/50",
                  !p.ativo && "opacity-60",
                )}
              >
                <Folder className="w-5 h-5 shrink-0 text-warning fill-warning/20" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{p.nome}</p>
                  <p className="text-[11px] text-muted-foreground">{p.nDocumentos + p.nSubpastas} {p.nDocumentos + p.nSubpastas === 1 ? "item" : "itens"}</p>
                </div>
                <span onClick={(e) => e.stopPropagation()}>{botaoMenu({ tipo: "pasta", pasta: p })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {docsOrdenados.length > 0 && (
        <div>
          {pastasVisiveis.length > 0 && <p className="text-xs font-medium text-muted-foreground mb-2">Arquivos</p>}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
            {docsOrdenados.map((d) => (
              <div
                key={d.id}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData(MIME_DOC, d.id); e.dataTransfer.effectAllowed = "move"; }}
                onClick={() => abrirDoc(d)}
                onContextMenu={(e) => abrirMenu(e, { tipo: "doc", doc: d })}
                className="group rounded-xl border border-border bg-card hover:bg-muted cursor-pointer overflow-hidden flex flex-col"
              >
                <div className="flex items-center gap-2 px-3 pt-2.5 pb-2 min-w-0">
                  {nomeDoc(d)}
                  <span className="ml-auto" onClick={(e) => e.stopPropagation()}>{botaoMenu({ tipo: "doc", doc: d })}</span>
                </div>
                <div className="mx-2 h-24 rounded-lg bg-muted/60 flex items-center justify-center">
                  <IconeArquivo mime={d.versaoVigente?.mime} nome={d.versaoVigente?.nome} className="w-10 h-10 opacity-80" />
                </div>
                <div className="px-3 py-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <SituacaoBadge situacao={situacaoDoc(d)} />
                  {d.validade && <span className="ml-auto">{validadeTxt(d)}</span>}
                </div>
                {mostrarLocal && <p className="px-3 pb-2 -mt-1 text-[11px] text-muted-foreground truncate">{d.caminho}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ── Menu de contexto ───────────────────────────────────────────────────────
  function itensMenu(alvo: Alvo): { rotulo: string; icon: React.ReactNode; acao: () => void; perigo?: boolean; desab?: string; sep?: boolean }[] {
    if (alvo.tipo === "vazio") {
      return [
        { rotulo: "Nova pasta", icon: <FolderPlus className="w-4 h-4" />, acao: () => setDialogo({ tipo: "novaPasta", paiId: pastaAtual }) },
        { rotulo: "Enviar arquivos", icon: <FileUp className="w-4 h-4" />, acao: () => { setEnvioPasta(undefined); inputArquivos.current?.click(); } },
      ];
    }
    if (alvo.tipo === "pasta") {
      const p = alvo.pasta;
      const travada = p.sistema ? "Pasta do sistema (usada por outros módulos)" : undefined;
      const naoVazia = p.nDocumentos + p.nSubpastas > 0 ? "A pasta não está vazia" : undefined;
      return [
        { rotulo: "Abrir", icon: <FolderOpen className="w-4 h-4" />, acao: () => abrirPasta(p.id) },
        { rotulo: "Nova subpasta", icon: <FolderPlus className="w-4 h-4" />, acao: () => setDialogo({ tipo: "novaPasta", paiId: p.id }) },
        { rotulo: "Enviar arquivos para cá", icon: <FileUp className="w-4 h-4" />, acao: () => { setEnvioPasta(p.id); inputArquivos.current?.click(); } },
        { rotulo: "Renomear", icon: <Pencil className="w-4 h-4" />, acao: () => setDialogo({ tipo: "renomearPasta", pasta: p }), sep: true },
        { rotulo: "Mover para…", icon: <FolderInput className="w-4 h-4" />, acao: () => setDialogo({ tipo: "moverPasta", pasta: p }), desab: travada },
        { rotulo: p.ativo ? "Inativar" : "Reativar", icon: <Power className="w-4 h-4" />, acao: () => avisar(api(`/api/documentos/categorias/${p.id}`, "PATCH", { ativo: !p.ativo })) },
        { rotulo: "Excluir", icon: <Trash2 className="w-4 h-4" />, acao: () => setDialogo({ tipo: "excluirPasta", pasta: p }), perigo: true, desab: travada ?? naoVazia, sep: true },
      ];
    }
    const d = alvo.doc;
    return [
      { rotulo: "Visualizar", icon: <Eye className="w-4 h-4" />, acao: () => abrirDoc(d) },
      { rotulo: "Abrir em aba", icon: <ExternalLink className="w-4 h-4" />, acao: () => router.push(`/documentos/${d.id}`) },
      { rotulo: "Baixar", icon: <Download className="w-4 h-4" />, acao: () => window.open(`/api/documentos/${d.id}/arquivo?download=1`, "_blank"), desab: d.versaoVigente ? undefined : "Sem arquivo" },
      { rotulo: "Nova versão", icon: <UploadCloud className="w-4 h-4" />, acao: () => setDialogo({ tipo: "versaoDoc", doc: d }), sep: true },
      { rotulo: "Renomear", icon: <Pencil className="w-4 h-4" />, acao: () => setDialogo({ tipo: "renomearDoc", doc: d }) },
      { rotulo: "Mover para…", icon: <FolderInput className="w-4 h-4" />, acao: () => setDialogo({ tipo: "moverDoc", doc: d }) },
      { rotulo: d.favorito ? "Remover estrela" : "Adicionar estrela", icon: <Star className="w-4 h-4" />, acao: () => alternarEstrela(d) },
      {
        rotulo: d.status === "ARQUIVADO" ? "Reativar" : "Arquivar", icon: <Archive className="w-4 h-4" />, sep: true,
        acao: () => avisar(api(`/api/documentos/${d.id}`, "PATCH", { status: d.status === "ARQUIVADO" ? "VIGENTE" : "ARQUIVADO" })),
      },
      { rotulo: "Excluir", icon: <Trash2 className="w-4 h-4" />, acao: () => setDialogo({ tipo: "excluirDoc", doc: d }), perigo: true },
    ];
  }

  useEffect(() => {
    if (!menu) return;
    const fechar = () => setMenu(null);
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
      window.removeEventListener("keydown", tecla);
    };
  }, [menu]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="relative p-4 space-y-3 min-h-[calc(100vh-4rem)]"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Barra do topo */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-foreground">{titulo}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Button onClick={() => setMenuNovo((v) => !v)} className="h-9">
              <Plus className="w-4 h-4 mr-1" /> Novo <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-70" />
            </Button>
            {menuNovo && (
              <>
                <div className="fixed inset-0 z-40" onMouseDown={() => setMenuNovo(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-card border border-border rounded-xl shadow-xl text-sm overflow-hidden py-1">
                  <button className="w-full flex items-start gap-2.5 px-3 py-2 hover:bg-muted text-left" onClick={() => { setMenuNovo(false); setEnvioPasta(undefined); inputArquivos.current?.click(); }}>
                    <FileUp className="w-4 h-4 mt-0.5 text-muted-foreground" />
                    <span><span className="block font-medium text-foreground">Enviar arquivos</span><span className="block text-xs text-muted-foreground">Vários de uma vez{pastaObj ? ` para ${pastaObj.nome}` : ""}</span></span>
                  </button>
                  <button className="w-full flex items-start gap-2.5 px-3 py-2 hover:bg-muted text-left" onClick={() => { setMenuNovo(false); setDialogo({ tipo: "novaPasta", paiId: visao === "acervo" && !global ? pastaAtual : null }); }}>
                    <FolderPlus className="w-4 h-4 mt-0.5 text-muted-foreground" />
                    <span><span className="block font-medium text-foreground">Nova pasta</span><span className="block text-xs text-muted-foreground">{pastaObj && !global ? `Dentro de ${pastaObj.nome}` : "Na raiz do acervo"}</span></span>
                  </button>
                  <div className="h-px bg-border my-1" />
                  <button className="w-full flex items-start gap-2.5 px-3 py-2 hover:bg-muted text-left" onClick={() => { setMenuNovo(false); setShowCreate(true); }}>
                    <FilePlus2 className="w-4 h-4 mt-0.5 text-muted-foreground" />
                    <span><span className="block font-medium text-foreground">Documento detalhado</span><span className="block text-xs text-muted-foreground">Com validade, vínculos e confidencial</span></span>
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="relative w-72 max-w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar título, número, emissor, tag..."
              className="pl-9 pr-8 h-9 text-sm"
            />
            {busca && (
              <button onClick={() => setBusca("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <FilterBarToggle bar={bar} chips={chips} />
          <div className="flex items-center gap-0.5 h-9 p-0.5 border border-border rounded-lg bg-card">
            {([
              { v: "lista", label: "Lista", Icon: LayoutList },
              { v: "grade", label: "Grade", Icon: LayoutGrid },
            ] as const).map(({ v, label, Icon }) => (
              <button
                key={v}
                type="button"
                onClick={() => setLayout(v)}
                title={label}
                className={cn("flex items-center h-full px-2 rounded-md transition-colors", layout === v ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Selos (contadores clicáveis) */}
      {resumo && (
        <div className="flex flex-wrap items-center gap-1.5">
          {selo("VENCIDO", "vencidos", resumo.VENCIDO, "text-danger")}
          {selo("VENCE_EM_BREVE", "vencem em breve", resumo.VENCE_EM_BREVE, "text-warning")}
          {selo("EM_RENOVACAO", "em renovação", resumo.EM_RENOVACAO, "text-info")}
          {selo("FALTA_VALIDADE", "falta validade", resumo.FALTA_VALIDADE, "text-warning")}
          <span className="text-xs text-muted-foreground ml-1">{resumo.total} documento{resumo.total === 1 ? "" : "s"} no acervo</span>
        </div>
      )}

      <FilterBarChips bar={bar} chips={chips} />

      <input
        ref={inputArquivos}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; if (fs.length) setEnvio(fs); }}
      />

      <div className="flex gap-4 items-start">
        {/* Árvore de pastas (Acervo) */}
        {visao === "acervo" && arvore && (
          <aside className="hidden lg:block w-60 shrink-0 sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto bg-card border border-border rounded-xl p-1.5">
            <PastaTree
              pastas={pastas}
              selecionada={global ? null : pastaAtual}
              onSelecionar={abrirPasta}
              mostrarRaiz
              onSoltar={(id, dt) => soltarEm(id, dt)}
            />
          </aside>
        )}

        <div className="flex-1 min-w-0 space-y-3">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 min-h-8 text-sm flex-wrap">
            {visao === "acervo" && (
              <button
                type="button"
                onClick={() => setArvore((v) => !v)}
                className="hidden lg:inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground mr-1"
                title={arvore ? "Esconder árvore de pastas" : "Mostrar árvore de pastas"}
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            )}
            {visao !== "acervo" ? (
              <span className="font-medium text-foreground px-1.5">{titulo}</span>
            ) : global ? (
              <>
                <span className="font-medium text-foreground px-1.5">Resultados em todas as pastas</span>
                <span className="text-muted-foreground">· {docsOrdenados.length}</span>
                <button onClick={limparTudo} className="ml-2 text-xs text-primary hover:underline">Limpar busca e filtros</button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  {...propsAlvo(null, "bc:raiz")}
                  onClick={() => abrirPasta(null)}
                  className={cn("px-1.5 py-0.5 rounded-md hover:bg-muted", pastaAtual ? "text-muted-foreground" : "font-medium text-foreground", alvoDrop === "bc:raiz" && "bg-primary/10")}
                >
                  Acervo
                </button>
                {trilha.map((p, i) => (
                  <span key={p.id} className="flex items-center gap-1">
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    <button
                      type="button"
                      {...propsAlvo(p.id, `bc:${p.id}`)}
                      onClick={() => (i === trilha.length - 1 ? undefined : abrirPasta(p.id))}
                      onContextMenu={(e) => abrirMenu(e, { tipo: "pasta", pasta: p })}
                      className={cn("px-1.5 py-0.5 rounded-md hover:bg-muted", i === trilha.length - 1 ? "font-medium text-foreground" : "text-muted-foreground", alvoDrop === `bc:${p.id}` && "bg-primary/10")}
                    >
                      {p.nome}
                    </button>
                  </span>
                ))}
                {pastaObj?.exigeValidade && (
                  <span className="ml-2 text-[11px] text-muted-foreground">· exige validade, alerta {pastaObj.diasAlerta} dias antes</span>
                )}
              </>
            )}
          </div>

          {aviso && (
            <div className="flex items-start gap-2 bg-danger/10 border border-danger/30 text-danger px-3 py-2 rounded-lg text-sm">
              <span className="flex-1">{aviso}</span>
              <button onClick={() => setAviso("")}><X className="w-4 h-4" /></button>
            </div>
          )}
          {erro && <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm">{erro}</div>}

          {/* Área da pasta (clique direito no vazio = Nova pasta / Enviar) */}
          <div
            className="min-h-[50vh]"
            onContextMenu={(e) => { if (visao === "acervo" && !global && e.target === e.currentTarget) abrirMenu(e, { tipo: "vazio" }); }}
          >
            {loading && docs.length === 0 && pastasVisiveis.length === 0 ? (
              <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : vazio ? (
              <div
                className="text-center py-20 text-muted-foreground border-2 border-dashed border-border rounded-xl"
                onContextMenu={(e) => { if (visao === "acervo" && !global) abrirMenu(e, { tipo: "vazio" }); }}
              >
                {visao === "estrela" ? <Star className="w-10 h-10 mx-auto mb-3 opacity-40" /> : <UploadCloud className="w-10 h-10 mx-auto mb-3 opacity-40" />}
                <p className="text-sm">
                  {global ? "Nada encontrado com essa busca/filtros."
                    : visao === "estrela" ? "Nenhum documento com estrela. Use o menu ⋮ de um documento para marcar."
                    : visao === "recentes" ? "Você ainda não abriu nenhum documento."
                    : chipsAtivos ? "Nenhum documento com esses filtros."
                    : "Esta pasta está vazia."}
                </p>
                {visao === "acervo" && !global && pastaAtual && <p className="text-xs mt-1">Arraste arquivos para cá ou use Novo › Enviar arquivos.</p>}
              </div>
            ) : layout === "grade" ? grade : lista}
          </div>
        </div>
      </div>

      {/* Overlay de soltar arquivos */}
      {arrastandoArquivos && (
        <div className="pointer-events-none absolute inset-2 z-30 rounded-2xl border-2 border-dashed border-primary bg-primary/5 flex items-center justify-center">
          <div className="bg-card border border-border shadow-xl rounded-xl px-5 py-3 flex items-center gap-2 text-sm text-foreground">
            <UploadCloud className="w-5 h-5 text-primary" />
            {pastaObj && !global ? <>Solte para enviar para <span className="font-semibold">{pastaObj.nome}</span></> : "Solte para enviar (você escolhe a pasta)"}
          </div>
        </div>
      )}

      {/* Menu ⋮ / clique direito */}
      {menu && (
        <>
          <div className="fixed inset-0 z-[60]" onMouseDown={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div
            className="fixed z-[61] w-56 bg-card border border-border rounded-xl shadow-xl py-1 text-sm"
            style={{
              left: Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 232),
              top: Math.max(8, Math.min(menu.y, (typeof window !== "undefined" ? window.innerHeight : 800) - 360)),
            }}
          >
            {itensMenu(menu.alvo).map((it, i) => (
              <div key={i}>
                {it.sep && i > 0 && <div className="h-px bg-border my-1" />}
                <button
                  type="button"
                  disabled={!!it.desab}
                  title={it.desab}
                  onClick={() => { setMenu(null); it.acao(); }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-1.5 text-left",
                    it.desab ? "text-muted-foreground/50 cursor-not-allowed" : it.perigo ? "text-danger hover:bg-danger/10" : "text-foreground hover:bg-muted",
                  )}
                >
                  <span className="text-muted-foreground">{it.icon}</span>{it.rotulo}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Visualização em overlay */}
      {viewerId && (
        <DocumentoDetalhe id={viewerId} modo="overlay" pastas={pastas} onFechar={() => setViewerId(null)} onMudou={recarregar} />
      )}

      {/* Envio rápido */}
      {envio && (
        <EnvioRapido
          arquivos={envio}
          pastaInicial={visao === "acervo" ? destinoEnvio ?? null : null}
          pastas={pastas}
          onFechar={() => { setEnvio(null); setEnvioPasta(undefined); }}
          onConcluido={recarregar}
        />
      )}

      {showCreate && (
        <DocumentoCreateDrawer
          pastaInicial={visao === "acervo" ? pastaAtual : null}
          onFechar={() => setShowCreate(false)}
          onCriado={(id) => { setShowCreate(false); recarregar(); setViewerId(id); }}
        />
      )}

      {/* Diálogos */}
      {dialogo?.tipo === "novaPasta" && (() => {
        const pai = pastas.find((p) => p.id === dialogo.paiId);
        return (
          <NomeDialog
            titulo={pai ? `Nova pasta em ${pai.nome}` : "Nova pasta"}
            inicial=""
            confirmar="Criar"
            comRegras
            regrasIniciais={{ exigeValidade: pai?.exigeValidade ?? false, diasAlerta: pai?.diasAlerta ?? 30 }}
            onFechar={() => setDialogo(null)}
            onSalvar={(nome, regras) => api("/api/documentos/categorias", "POST", { nome, paiId: dialogo.paiId, ...regras })}
          />
        );
      })()}
      {dialogo?.tipo === "renomearPasta" && (
        <NomeDialog
          titulo="Renomear pasta"
          inicial={dialogo.pasta.nome}
          comRegras
          regrasIniciais={{ exigeValidade: dialogo.pasta.exigeValidade, diasAlerta: dialogo.pasta.diasAlerta }}
          onFechar={() => setDialogo(null)}
          onSalvar={(nome, regras) => api(`/api/documentos/categorias/${dialogo.pasta.id}`, "PATCH", { nome, ...regras })}
        />
      )}
      {dialogo?.tipo === "moverPasta" && (
        <MoverDialog
          titulo={`Mover a pasta "${dialogo.pasta.nome}"`}
          pastas={pastas}
          atual={dialogo.pasta.paiId}
          bloquear={descendentes(pastas, dialogo.pasta.id)}
          permitirRaiz
          onFechar={() => setDialogo(null)}
          onMover={(destino) => moverPasta(dialogo.pasta.id, destino)}
        />
      )}
      {dialogo?.tipo === "excluirPasta" && (
        <ConfirmarDialog
          titulo={`Excluir a pasta "${dialogo.pasta.nome}"?`}
          texto="A pasta está vazia e será removida."
          confirmar="Excluir"
          perigo
          onFechar={() => setDialogo(null)}
          onConfirmar={async () => {
            const e = await api(`/api/documentos/categorias/${dialogo.pasta.id}`, "DELETE");
            if (!e && pastaAtual === dialogo.pasta.id) abrirPasta(dialogo.pasta.paiId);
            return e;
          }}
        />
      )}
      {dialogo?.tipo === "renomearDoc" && (
        <NomeDialog
          titulo="Renomear documento"
          rotulo="Título"
          inicial={dialogo.doc.titulo}
          onFechar={() => setDialogo(null)}
          onSalvar={(titulo) => api(`/api/documentos/${dialogo.doc.id}`, "PATCH", { titulo })}
        />
      )}
      {dialogo?.tipo === "moverDoc" && (
        <MoverDialog
          titulo={`Mover "${dialogo.doc.titulo}"`}
          pastas={pastas}
          atual={dialogo.doc.categoria.id}
          onFechar={() => setDialogo(null)}
          onMover={(destino) => (destino ? moverDoc(dialogo.doc.id, destino) : Promise.resolve("Escolha uma pasta."))}
        />
      )}
      {dialogo?.tipo === "excluirDoc" && (
        <ConfirmarDialog
          titulo={`Excluir ${dialogo.doc.titulo}?`}
          texto="Os metadados vão para a Lixeira do sistema (90 dias) e os arquivos do Drive para a pasta _lixeira — dá para restaurar."
          confirmar="Excluir"
          perigo
          onFechar={() => setDialogo(null)}
          onConfirmar={() => api(`/api/documentos/${dialogo.doc.id}`, "DELETE")}
        />
      )}
      {dialogo?.tipo === "versaoDoc" && (
        <NovaVersaoDialog
          documentoId={dialogo.doc.id}
          emRenovacao={dialogo.doc.status === "EM_RENOVACAO"}
          onFechar={() => setDialogo(null)}
          onSalvo={recarregar}
        />
      )}
    </div>
  );
}
