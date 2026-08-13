"use client";

// Detalhe do documento: preview, metadados, versões, renovação, acessos e log.
import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import DatePicker from "@/components/shared/DatePicker";
import EscClose from "@/components/shared/EscClose";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import {
  Loader2, ArrowLeft, Download, Eye, RefreshCw, UploadCloud, Trash2, X,
  Lock, FileWarning, History, Archive,
} from "lucide-react";
import { StatusDocBadge, fmtBytes } from "@/components/documentos/comum";

type DetalheDTO = {
  id: string;
  titulo: string;
  descricao: string | null;
  numero: string | null;
  emissor: string | null;
  emissao: string | null;
  validade: string | null;
  diasAlerta: number | null;
  status: string;
  confidencial: boolean;
  arquivoOk: boolean;
  tags: string[];
  criadoPor: string | null;
  createdAt: string;
  categoria: { id: string; nome: string; diasAlerta: number };
  responsavel: { id: string; nome: string } | null;
  fornecedor: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  cliente: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  colaborador: { id: string; nome: string } | null;
  imobilizado: { id: string; descricao: string } | null;
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

export default function DocumentoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [doc, setDoc] = useState<DetalheDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [showNovaVersao, setShowNovaVersao] = useState(false);
  const [nvFile, setNvFile] = useState<File | null>(null);
  const [nvValidade, setNvValidade] = useState("");
  const [nvObs, setNvObs] = useState("");
  const [nvSalvando, setNvSalvando] = useState(false);
  const [confirmaExcluir, setConfirmaExcluir] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/documentos/${id}`);
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro"); return; }
      setDoc(json.data);
    } catch {
      setErro("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useTabTitle(doc ? doc.titulo : null);

  async function patch(data: Record<string, unknown>) {
    await fetch(`/api/documentos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => {});
    load();
  }

  async function renovar() {
    await fetch(`/api/documentos/${id}/renovar`, { method: "POST" }).catch(() => {});
    setShowNovaVersao(true);
    load();
  }

  async function salvarNovaVersao() {
    if (!nvFile) return;
    setNvSalvando(true);
    const fd = new FormData();
    fd.set("file", nvFile);
    if (nvValidade) fd.set("validade", nvValidade);
    if (nvObs) fd.set("observacao", nvObs);
    const res = await fetch(`/api/documentos/${id}/versoes`, { method: "POST", body: fd }).catch(() => null);
    setNvSalvando(false);
    if (res?.ok) { setShowNovaVersao(false); setNvFile(null); setNvValidade(""); setNvObs(""); load(); }
  }

  async function excluir() {
    const res = await fetch(`/api/documentos/${id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) router.push("/documentos");
  }

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!doc) return <div className="px-8 pt-8 text-danger">{erro || "Documento não encontrado"}</div>;

  const vinculo = doc.fornecedor
    ? { label: "Fornecedor", nome: doc.fornecedor.nomeFantasia || doc.fornecedor.razaoSocial }
    : doc.cliente
    ? { label: "Cliente", nome: doc.cliente.nomeFantasia || doc.cliente.razaoSocial }
    : doc.colaborador
    ? { label: "Colaborador", nome: doc.colaborador.nome }
    : doc.imobilizado
    ? { label: "Bem", nome: doc.imobilizado.descricao }
    : null;
  const podePreview = doc.versaoVigente && (doc.versaoVigente.mime.startsWith("image/") || doc.versaoVigente.mime === "application/pdf");

  return (
    <div>
      <PageHeader
        title={doc.titulo}
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {doc.versaoVigente && (
              <>
                <Button variant="outline" onClick={() => window.open(`/api/documentos/${id}/arquivo`, "_blank")}>
                  <Eye className="w-4 h-4 mr-2" /> Visualizar
                </Button>
                <Button variant="outline" onClick={() => window.open(`/api/documentos/${id}/arquivo?download=1`, "_blank")}>
                  <Download className="w-4 h-4 mr-2" /> Baixar
                </Button>
              </>
            )}
            <Button onClick={renovar} className="bg-blue-600 hover:bg-blue-700">
              <RefreshCw className="w-4 h-4 mr-2" /> Renovar
            </Button>
            <Button variant="outline" onClick={() => setShowNovaVersao(true)}>
              <UploadCloud className="w-4 h-4 mr-2" /> Nova versão
            </Button>
            <Button variant="outline" onClick={() => patch({ status: doc.status === "ARQUIVADO" ? "VIGENTE" : "ARQUIVADO" })}>
              <Archive className="w-4 h-4 mr-2" /> {doc.status === "ARQUIVADO" ? "Reativar" : "Arquivar"}
            </Button>
            <Button
              variant="outline"
              className="text-danger border-danger/30 hover:bg-danger/10"
              onClick={() => setConfirmaExcluir(true)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            <Button variant="outline" onClick={() => router.push("/documentos")}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
            </Button>
          </div>
        }
      />

      <div className="px-8 pb-8 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* ── Preview + metadados ─────────────────────────────────────────── */}
        <div className="space-y-5">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusDocBadge status={doc.status} />
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

          {podePreview ? (
            <iframe
              src={`/api/documentos/${id}/arquivo`}
              className="w-full h-[520px] bg-card border border-border rounded-xl"
              title={doc.titulo}
            />
          ) : doc.versaoVigente ? (
            <div className="bg-card border border-border rounded-xl px-5 py-10 text-center text-sm text-muted-foreground">
              {doc.versaoVigente.nome} ({fmtBytes(doc.versaoVigente.tamanho)}) — sem preview para este formato; use Baixar.
            </div>
          ) : null}

          {/* Metadados editáveis */}
          <div className="bg-card rounded-xl border border-border p-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Categoria</p>
              <p className="font-medium text-foreground">{doc.categoria.nome}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Número</p>
              <p className="font-mono text-foreground">{doc.numero || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Emissor</p>
              <p className="text-foreground">{doc.emissor || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Emissão</p>
              <DatePicker value={doc.emissao ? doc.emissao.slice(0, 10) : ""} onChange={(v) => patch({ emissao: v || null })} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Validade</p>
              <DatePicker value={doc.validade ? doc.validade.slice(0, 10) : ""} onChange={(v) => patch({ validade: v || null })} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Alerta (dias antes)</p>
              <Input
                type="number"
                defaultValue={doc.diasAlerta ?? doc.categoria.diasAlerta}
                onBlur={(e) => patch({ diasAlerta: e.target.value })}
                className="h-9"
              />
            </div>
            {vinculo && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">{vinculo.label}</p>
                <p className="text-foreground">{vinculo.nome}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Responsável</p>
              <p className="text-foreground">{doc.responsavel?.nome ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Cadastrado</p>
              <p className="text-foreground text-xs">{doc.criadoPor ? `${doc.criadoPor} · ` : ""}{new Date(doc.createdAt).toLocaleDateString("pt-BR")}</p>
            </div>
            {doc.descricao && (
              <div className="col-span-2 md:col-span-3">
                <p className="text-xs text-muted-foreground mb-0.5">Descrição</p>
                <p className="text-foreground whitespace-pre-wrap">{doc.descricao}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Lateral: versões, acessos, log ──────────────────────────────── */}
        <div className="space-y-5">
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-2.5 bg-muted border-b border-border flex items-center gap-2">
              <History className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Versões</span>
            </div>
            <div className="divide-y divide-border">
              {doc.versoes.map((v) => (
                <div key={v.id} className="px-4 py-2.5 flex items-center gap-2">
                  <span className={cn("text-xs font-mono px-1.5 py-0.5 rounded", v.id === doc.versaoVigente?.id ? "bg-success/15 text-success font-bold" : "bg-muted text-muted-foreground")}>
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
                    onClick={() => window.open(`/api/documentos/${id}/arquivo?versao=${v.versao}&download=1`, "_blank")}
                    className="text-muted-foreground hover:text-foreground"
                    title="Baixar esta versão"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {doc.confidencial && (
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
          )}

          {doc.ehGestor && doc.logs.length > 0 && (
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
          )}
        </div>
      </div>

      {/* ── Nova versão ──────────────────────────────────────────────────── */}
      {showNovaVersao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !nvSalvando) setShowNovaVersao(false); }}>
          <EscClose onClose={() => { if (!nvSalvando) setShowNovaVersao(false); }} />
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
              <h2 className="font-semibold text-foreground">{doc.status === "EM_RENOVACAO" ? "Concluir renovação" : "Nova versão"}</h2>
              <button onClick={() => setShowNovaVersao(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="space-y-1.5">
                <Label>Arquivo <span className="text-red-500">*</span></Label>
                <input type="file" onChange={(e) => setNvFile(e.target.files?.[0] ?? null)} className="text-sm text-foreground" />
              </div>
              <div className="space-y-1.5">
                <Label>Nova validade {doc.status === "EM_RENOVACAO" && <span className="text-xs text-muted-foreground">(conclui a renovação)</span>}</Label>
                <DatePicker value={nvValidade} onChange={setNvValidade} />
              </div>
              <div className="space-y-1.5">
                <Label>Observação</Label>
                <Input value={nvObs} onChange={(e) => setNvObs(e.target.value)} placeholder='Ex.: "renovada até 2027"' />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border bg-muted rounded-b-2xl flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNovaVersao(false)} disabled={nvSalvando}>Cancelar</Button>
              <Button onClick={salvarNovaVersao} disabled={nvSalvando || !nvFile} className="bg-blue-600 hover:bg-blue-700">
                {nvSalvando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UploadCloud className="w-4 h-4 mr-2" />} Salvar versão
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Excluir ──────────────────────────────────────────────────────── */}
      {confirmaExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <EscClose onClose={() => setConfirmaExcluir(false)} />
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <p className="font-semibold text-foreground">Excluir {doc.titulo}?</p>
            <p className="text-sm text-muted-foreground mt-1">
              Os metadados vão para a Lixeira do sistema (90 dias) e os arquivos são movidos para a pasta _lixeira do Drive — nada é apagado de verdade.
            </p>
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="outline" onClick={() => setConfirmaExcluir(false)}>Cancelar</Button>
              <Button onClick={excluir} className="bg-red-600 hover:bg-red-700 text-white">
                <Trash2 className="w-4 h-4 mr-1.5" /> Excluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
