"use client";

// Detalhe do documento — usado na página /documentos/[id] (modo "pagina") e
// na visualização em overlay do Acervo (modo "overlay", padrão Drive: preview
// grande + painel lateral de detalhes). Preview, metadados editáveis, versões,
// renovação, estrela, mover, arquivar, excluir (Lixeira), acessos e log.
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import DatePicker from "@/components/shared/DatePicker";
import EscClose from "@/components/shared/EscClose";
import ModalPortal from "@/components/shared/ModalPortal";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import {
  Loader2, ArrowLeft, Download, Eye, RefreshCw, UploadCloud, Trash2, X,
  Lock, FileWarning, History, Archive, Star, ExternalLink, FolderInput, Pencil, Folder,
} from "lucide-react";
import { SituacaoBadge, fmtBytes, situacaoDoc, IconeArquivo, tipoArquivo, type PastaDTO } from "./comum";
import NovaVersaoDialog from "./NovaVersaoDialog";
import { ConfirmarDialog, MoverDialog, NomeDialog } from "./Dialogos";

type DetalheDTO = {
  id: string;
  titulo: string;
  descricao: string | null;
  numero: string | null;
  emissor: string | null;
  emissao: string | null;
  validade: string | null;
  diasAlerta: number | null;
  status: "VIGENTE" | "VENCE_EM_BREVE" | "VENCIDO" | "EM_RENOVACAO" | "ARQUIVADO";
  confidencial: boolean;
  arquivoOk: boolean;
  tags: string[];
  criadoPor: string | null;
  createdAt: string;
  updatedAt: string;
  responsavelId: string | null;
  categoriaId: string;
  caminho: string;
  favorito: boolean;
  faltaValidade: boolean;
  categoria: { id: string; nome: string; diasAlerta: number; exigeValidade: boolean };
  responsavel: { id: string; nome: string } | null;
  fornecedor: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  cliente: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  colaborador: { id: string; nome: string } | null;
  imobilizado: { id: string; descricao: string } | null;
  contratoId: string | null;
  processoId: string | null;
  versaoVigente: { id: string; versao: number; nome: string; mime: string; tamanho: number; provider: string; createdAt: string } | null;
  versoes: { id: string; versao: number; nome: string; mime: string; tamanho: number; observacao: string | null; criadoPor: string | null; createdAt: string }[];
  acessos: { usuarioId: string; usuario: { id: string; nome: string } }[];
  logs: { id: string; acao: string; createdAt: string; usuario: { nome: string } }[];
  ehGestor: boolean;
};

const ACAO_LOG: Record<string, string> = {
  VISUALIZOU: "visualizou", BAIXOU: "baixou", UPLOAD_VERSAO: "subiu nova versão",
  EDITOU: "editou", RENOVOU: "renovação",
};

type Opcao = { id: string; nome: string };

export default function DocumentoDetalhe({
  id, modo, onFechar, onMudou, pastas: pastasProp,
}: {
  id: string;
  modo: "pagina" | "overlay";
  onFechar?: () => void;
  /** Algo mudou (lista do Acervo deve recarregar). */
  onMudou?: () => void;
  pastas?: PastaDTO[];
}) {
  const router = useRouter();
  const [doc, setDoc] = useState<DetalheDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [usuarios, setUsuarios] = useState<Opcao[]>([]);
  const [pastas, setPastas] = useState<PastaDTO[]>(pastasProp ?? []);
  const [dialogo, setDialogo] = useState<null | "versao" | "excluir" | "mover" | "renomear">(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/documentos/${id}`);
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro"); return; }
      setDoc(json.data);
      setErro("");
    } catch {
      setErro("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { setLoading(true); load(); }, [load]);
  useEffect(() => {
    fetch("/api/documentos/lookups").then((r) => r.json()).then((j) => setUsuarios(j.data?.usuarios ?? [])).catch(() => {});
  }, []);
  useEffect(() => { if (pastasProp) setPastas(pastasProp); }, [pastasProp]);
  useTabTitle(modo === "pagina" && doc ? doc.titulo : null);

  async function carregarPastas() {
    if (pastas.length > 0) return;
    const j = await fetch("/api/documentos/categorias").then((r) => r.json()).catch(() => null);
    setPastas(j?.data ?? []);
  }

  async function patch(data: Record<string, unknown>): Promise<string | null> {
    const res = await fetch(`/api/documentos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => null);
    if (!res?.ok) {
      const j = await res?.json().catch(() => null);
      const msg = j?.error || "Não foi possível salvar.";
      setAviso(msg);
      return msg;
    }
    setAviso("");
    await load();
    onMudou?.();
    return null;
  }

  async function alternarEstrela() {
    if (!doc) return;
    setDoc({ ...doc, favorito: !doc.favorito });
    await fetch(`/api/documentos/${id}/favorito`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ favorito: !doc.favorito }),
    }).catch(() => {});
    onMudou?.();
  }

  async function renovar() {
    await fetch(`/api/documentos/${id}/renovar`, { method: "POST" }).catch(() => {});
    await load();
    onMudou?.();
    setDialogo("versao");
  }

  async function excluir(): Promise<string | null> {
    const res = await fetch(`/api/documentos/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return "Não foi possível excluir.";
    onMudou?.();
    if (modo === "overlay") onFechar?.(); else router.push("/documentos");
    return null;
  }

  function abrirEmAba() {
    onFechar?.();
    router.push(`/documentos/${id}`);
  }

  // ── Estados de carregamento ────────────────────────────────────────────────
  if (loading || !doc) {
    const corpo = loading
      ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      : <p className="text-danger">{erro || "Documento não encontrado"}</p>;
    if (modo === "pagina") return <div className="flex justify-center py-24">{corpo}</div>;
    return (
      <ModalPortal>
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar?.(); }}>
          <EscClose onClose={() => onFechar?.()} />
          <div className="bg-card rounded-xl px-6 py-5">{corpo}</div>
        </div>
      </ModalPortal>
    );
  }

  const vinculo = doc.fornecedor
    ? { label: "Fornecedor", nome: doc.fornecedor.nomeFantasia || doc.fornecedor.razaoSocial }
    : doc.cliente
    ? { label: "Cliente", nome: doc.cliente.nomeFantasia || doc.cliente.razaoSocial }
    : doc.colaborador
    ? { label: "Colaborador", nome: doc.colaborador.nome }
    : doc.imobilizado
    ? { label: "Bem", nome: doc.imobilizado.descricao }
    : doc.contratoId ? { label: "Contrato", nome: "vinculado a um contrato" }
    : doc.processoId ? { label: "Processo", nome: "vinculado a um processo" }
    : null;
  const vv = doc.versaoVigente;
  const tipo = vv ? tipoArquivo(vv.mime, vv.nome) : "outro";
  const situacao = situacaoDoc(doc);
  const arquivoUrl = `/api/documentos/${id}/arquivo`;
  const chave = doc.updatedAt; // remonta inputs não controlados após salvar
  const largura = modo === "pagina" ? "col-span-2 md:col-span-3" : "col-span-2"; // linha inteira

  // ── Blocos ─────────────────────────────────────────────────────────────────
  const selos = (
    <div className="flex items-center gap-2 flex-wrap">
      <SituacaoBadge situacao={situacao} />
      {doc.confidencial && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          <Lock className="w-3 h-3" /> Confidencial
        </span>
      )}
      {!doc.arquivoOk && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-danger bg-danger/10 px-2 py-0.5 rounded-full">
          <FileWarning className="w-3 h-3" /> Arquivo não encontrado no Drive
        </span>
      )}
      {doc.tags.map((t) => <span key={t} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">#{t}</span>)}
    </div>
  );

  const preview = vv && (tipo === "pdf" || tipo === "imagem") ? (
    tipo === "imagem" ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={arquivoUrl} alt={doc.titulo} className="max-w-full max-h-full object-contain mx-auto" />
    ) : (
      <iframe src={arquivoUrl} className={cn("w-full bg-card", modo === "pagina" ? "h-[520px] border border-border rounded-xl" : "h-full rounded-lg")} title={doc.titulo} />
    )
  ) : vv ? (
    <div className={cn("text-center text-sm px-5 py-10", modo === "pagina" ? "bg-card border border-border rounded-xl text-muted-foreground" : "text-white/80")}>
      <IconeArquivo mime={vv.mime} nome={vv.nome} className="w-12 h-12 mx-auto mb-3" />
      <p>{vv.nome} ({fmtBytes(vv.tamanho)})</p>
      <p className="mt-1 opacity-80">Sem pré-visualização para este formato.</p>
      <Button className="mt-4" variant={modo === "pagina" ? "outline" : "secondary"} onClick={() => window.open(`${arquivoUrl}?download=1`, "_blank")}>
        <Download className="w-4 h-4 mr-2" /> Baixar
      </Button>
    </div>
  ) : (
    <p className={cn("text-sm text-center py-10", modo === "pagina" ? "text-muted-foreground" : "text-white/70")}>Documento sem arquivo.</p>
  );

  const campo = (rotulo: string, conteudo: React.ReactNode, cls?: string) => (
    <div className={cls}>
      <p className="text-xs text-muted-foreground mb-1">{rotulo}</p>
      {conteudo}
    </div>
  );

  const metadados = (
    <div key={chave} className={cn("grid gap-4 text-sm", modo === "pagina" ? "bg-card rounded-xl border border-border p-4 grid-cols-2 md:grid-cols-3" : "grid-cols-2")}>
      {campo("Pasta", (
        <button
          onClick={() => { carregarPastas(); setDialogo("mover"); }}
          className="inline-flex items-center gap-1.5 text-left text-foreground hover:text-primary group"
          title="Mover para outra pasta"
        >
          <Folder className="w-3.5 h-3.5 text-warning shrink-0" />
          <span className="font-medium">{doc.caminho}</span>
          <FolderInput className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 shrink-0" />
        </button>
      ), "col-span-2 " + (modo === "pagina" ? "md:col-span-1" : ""))}
      {campo("Número", <Input defaultValue={doc.numero ?? ""} onBlur={(e) => e.target.value !== (doc.numero ?? "") && patch({ numero: e.target.value })} className="h-8 font-mono" placeholder="—" />)}
      {campo("Emissor", <Input defaultValue={doc.emissor ?? ""} onBlur={(e) => e.target.value !== (doc.emissor ?? "") && patch({ emissor: e.target.value })} className="h-8" placeholder="—" />)}
      {campo("Emissão", <DatePicker value={doc.emissao ? doc.emissao.slice(0, 10) : ""} onChange={(v) => patch({ emissao: v || null })} />)}
      {campo(
        "Validade",
        <>
          <DatePicker value={doc.validade ? doc.validade.slice(0, 10) : ""} onChange={(v) => patch({ validade: v || null })} />
          {doc.faltaValidade && <p className="text-[11px] text-warning mt-1">A pasta exige validade — informe a data.</p>}
        </>,
      )}
      {campo("Alerta (dias antes)", (
        <Input type="number" defaultValue={doc.diasAlerta ?? doc.categoria.diasAlerta} onBlur={(e) => patch({ diasAlerta: e.target.value })} className="h-8" />
      ))}
      {campo("Responsável (recebe alertas)", (
        <ComboboxWithCreate
          value={doc.responsavelId ?? ""}
          onChange={(v) => patch({ responsavelId: v || null })}
          noneLabel="— Ninguém —"
          triggerClassName="h-8 rounded-lg"
          menuMinWidth={260}
          options={usuarios.map((u) => ({ value: u.id, label: u.nome }))}
        />
      ))}
      {vinculo && campo(vinculo.label, <p className="text-foreground">{vinculo.nome}</p>)}
      {campo("Tags", (
        <Input
          defaultValue={doc.tags.join(", ")}
          onBlur={(e) => e.target.value !== doc.tags.join(", ") && patch({ tags: e.target.value.split(",") })}
          className="h-8"
          placeholder="separadas por vírgula"
        />
      ))}
      {campo("Cadastrado", <p className="text-foreground text-xs">{doc.criadoPor ? `${doc.criadoPor} · ` : ""}{new Date(doc.createdAt).toLocaleDateString("pt-BR")}</p>)}
      {campo("Descrição", (
        <Textarea
          defaultValue={doc.descricao ?? ""}
          rows={2}
          onBlur={(e) => e.target.value !== (doc.descricao ?? "") && patch({ descricao: e.target.value })}
          placeholder="—"
        />
      ), largura)}
      <label className={cn(largura, "flex items-center gap-2 text-sm text-foreground cursor-pointer")}>
        <input type="checkbox" checked={doc.confidencial} onChange={(e) => patch({ confidencial: e.target.checked })} className="rounded" />
        <Lock className="w-3.5 h-3.5 text-muted-foreground" /> Confidencial — só responsável, admins e quem for listado
      </label>
    </div>
  );

  const versoes = (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-2.5 bg-muted border-b border-border flex items-center gap-2">
        <History className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">Versões</span>
        <button onClick={() => setDialogo("versao")} className="ml-auto text-xs text-primary hover:underline">+ Nova versão</button>
      </div>
      <div className="divide-y divide-border">
        {doc.versoes.map((v) => (
          <div key={v.id} className="px-4 py-2.5 flex items-center gap-2">
            <span className={cn("text-xs font-mono px-1.5 py-0.5 rounded", v.id === vv?.id ? "bg-success/15 text-success font-bold" : "bg-muted text-muted-foreground")}>
              v{v.versao}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground truncate">{v.nome}</p>
              <p className="text-[11px] text-muted-foreground">
                {fmtBytes(v.tamanho)} · {v.criadoPor ?? "—"} · {new Date(v.createdAt).toLocaleDateString("pt-BR")}
                {v.observacao && ` · ${v.observacao}`}
              </p>
            </div>
            <button
              onClick={() => window.open(`${arquivoUrl}?versao=${v.versao}&download=1`, "_blank")}
              className="text-muted-foreground hover:text-foreground"
              title="Baixar esta versão"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const acessos = doc.confidencial && (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-2.5 bg-muted border-b border-border flex items-center gap-2">
        <Lock className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">Quem pode ver</span>
      </div>
      <div className="px-4 py-2.5 text-sm text-foreground space-y-1">
        {doc.acessos.length === 0 && <p className="text-xs text-muted-foreground">Só responsável e administradores.</p>}
        {doc.acessos.map((a) => <p key={a.usuarioId}>{a.usuario.nome}</p>)}
      </div>
    </div>
  );

  const log = doc.ehGestor && doc.logs.length > 0 && (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-2.5 bg-muted border-b border-border">
        <span className="text-sm font-semibold text-foreground">Log de acessos</span>
      </div>
      <div className="px-4 py-2.5 space-y-1 max-h-64 overflow-y-auto">
        {doc.logs.map((l) => (
          <p key={l.id} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{l.usuario.nome}</span> {ACAO_LOG[l.acao] ?? l.acao.toLowerCase()}{" · "}
            {new Date(l.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </p>
        ))}
      </div>
    </div>
  );

  const avisoEl = aviso && <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{aviso}</p>;

  const dialogos = (
    <>
      {dialogo === "versao" && (
        <NovaVersaoDialog documentoId={id} emRenovacao={doc.status === "EM_RENOVACAO"} onFechar={() => setDialogo(null)} onSalvo={() => { load(); onMudou?.(); }} />
      )}
      {dialogo === "excluir" && (
        <ConfirmarDialog
          titulo={`Excluir ${doc.titulo}?`}
          texto="Os metadados vão para a Lixeira do sistema (90 dias) e os arquivos do Drive para a pasta _lixeira — dá para restaurar."
          confirmar="Excluir"
          perigo
          onFechar={() => setDialogo(null)}
          onConfirmar={excluir}
        />
      )}
      {dialogo === "mover" && (
        <MoverDialog
          titulo={`Mover "${doc.titulo}"`}
          pastas={pastas}
          atual={doc.categoriaId}
          onFechar={() => setDialogo(null)}
          onMover={(destino) => patch({ categoriaId: destino })}
        />
      )}
      {dialogo === "renomear" && (
        <NomeDialog titulo="Renomear documento" rotulo="Título" inicial={doc.titulo} onFechar={() => setDialogo(null)} onSalvar={(t) => patch({ titulo: t })} />
      )}
    </>
  );

  // ── Overlay (padrão Drive) ─────────────────────────────────────────────────
  if (modo === "overlay") {
    const btn = "inline-flex items-center justify-center h-9 w-9 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors";
    return (
      <ModalPortal>
        <div className="fixed inset-0 z-[9999] flex flex-col bg-black/85">
          {!dialogo && <EscClose onClose={() => onFechar?.()} />}
          {/* Barra do topo */}
          <div className="flex items-center gap-2 px-3 h-14 shrink-0 text-white">
            <button onClick={onFechar} className={btn} title="Fechar (Esc)"><ArrowLeft className="w-5 h-5" /></button>
            {vv && <IconeArquivo mime={vv.mime} nome={vv.nome} className="w-5 h-5" />}
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{doc.titulo}</p>
              <p className="text-[11px] text-white/60 truncate">{doc.caminho}</p>
            </div>
            <div className="ml-auto flex items-center gap-0.5">
              <button onClick={alternarEstrela} className={btn} title={doc.favorito ? "Remover estrela" : "Adicionar estrela"}>
                <Star className={cn("w-5 h-5", doc.favorito && "fill-warning text-warning")} />
              </button>
              <button onClick={() => setDialogo("renomear")} className={btn} title="Renomear"><Pencil className="w-4 h-4" /></button>
              {vv && <button onClick={() => window.open(`${arquivoUrl}?download=1`, "_blank")} className={btn} title="Baixar"><Download className="w-5 h-5" /></button>}
              <button onClick={() => setDialogo("versao")} className={btn} title="Nova versão"><UploadCloud className="w-5 h-5" /></button>
              <button onClick={renovar} className={btn} title="Renovar"><RefreshCw className="w-4 h-4" /></button>
              <button onClick={() => patch({ status: doc.status === "ARQUIVADO" ? "VIGENTE" : "ARQUIVADO" })} className={btn} title={doc.status === "ARQUIVADO" ? "Reativar" : "Arquivar"}>
                <Archive className="w-4 h-4" />
              </button>
              <button onClick={() => setDialogo("excluir")} className={btn} title="Excluir"><Trash2 className="w-4 h-4" /></button>
              <button onClick={abrirEmAba} className={cn(btn, "w-auto px-3 gap-1.5 text-sm")} title="Abrir na página do documento">
                <ExternalLink className="w-4 h-4" /> <span className="hidden md:inline">Abrir em aba</span>
              </button>
              <button onClick={onFechar} className={btn} title="Fechar (Esc)"><X className="w-5 h-5" /></button>
            </div>
          </div>
          {/* Corpo: preview + painel de detalhes */}
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 px-3 pb-3">
            <div
              className="flex-1 min-h-[40vh] flex items-center justify-center overflow-auto"
              onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar?.(); }}
            >
              {preview}
            </div>
            <aside className="lg:w-[400px] shrink-0 bg-background rounded-xl overflow-y-auto p-4 space-y-4">
              {selos}
              {avisoEl}
              {metadados}
              {versoes}
              {acessos}
              {log}
            </aside>
          </div>
          {dialogos}
        </div>
      </ModalPortal>
    );
  }

  // ── Página ─────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title={doc.titulo}
        breadcrumbs={[{ label: "Documentos", href: "/documentos" }, { label: doc.caminho, href: `/documentos?pasta=${doc.categoriaId}` }]}
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button variant="outline" onClick={alternarEstrela} title={doc.favorito ? "Remover estrela" : "Adicionar estrela"}>
              <Star className={cn("w-4 h-4", doc.favorito && "fill-warning text-warning")} />
            </Button>
            {vv && (
              <>
                <Button variant="outline" onClick={() => window.open(arquivoUrl, "_blank")}>
                  <Eye className="w-4 h-4 mr-2" /> Visualizar
                </Button>
                <Button variant="outline" onClick={() => window.open(`${arquivoUrl}?download=1`, "_blank")}>
                  <Download className="w-4 h-4 mr-2" /> Baixar
                </Button>
              </>
            )}
            <Button onClick={renovar} className="bg-blue-600 hover:bg-blue-700">
              <RefreshCw className="w-4 h-4 mr-2" /> Renovar
            </Button>
            <Button variant="outline" onClick={() => setDialogo("versao")}>
              <UploadCloud className="w-4 h-4 mr-2" /> Nova versão
            </Button>
            <Button variant="outline" onClick={() => setDialogo("renomear")} title="Renomear">
              <Pencil className="w-4 h-4" />
            </Button>
            <Button variant="outline" onClick={() => patch({ status: doc.status === "ARQUIVADO" ? "VIGENTE" : "ARQUIVADO" })}>
              <Archive className="w-4 h-4 mr-2" /> {doc.status === "ARQUIVADO" ? "Reativar" : "Arquivar"}
            </Button>
            <Button variant="outline" className="text-danger border-danger/30 hover:bg-danger/10" onClick={() => setDialogo("excluir")} title="Excluir">
              <Trash2 className="w-4 h-4" />
            </Button>
            <Button variant="outline" onClick={() => router.push(`/documentos?pasta=${doc.categoriaId}`)}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
            </Button>
          </div>
        }
      />

      <div className="px-8 pb-8 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        <div className="space-y-5">
          {selos}
          {avisoEl}
          {preview}
          {metadados}
        </div>
        <div className="space-y-5">
          {versoes}
          {acessos}
          {log}
        </div>
      </div>
      {dialogos}
    </div>
  );
}
