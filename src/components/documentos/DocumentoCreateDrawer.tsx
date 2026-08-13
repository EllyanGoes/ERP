"use client";

// Drawer de novo documento (ou nova versão de um vínculo pré-preenchido).
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import DatePicker from "@/components/shared/DatePicker";
import EscClose from "@/components/shared/EscClose";
import { Loader2, X, UploadCloud, Lock } from "lucide-react";
import SelectMenu from "@/components/shared/SelectMenu";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";

type Opcao = { id: string; nome: string };
type Categoria = { id: string; nome: string; diasAlerta: number; exigeValidade: boolean };
type Lookups = { usuarios: Opcao[]; fornecedores: Opcao[]; clientes: Opcao[]; colaboradores: Opcao[]; imobilizados: Opcao[] };

export default function DocumentoCreateDrawer({
  onFechar, onCriado, vinculo,
}: {
  onFechar: () => void;
  onCriado: (id: string) => void;
  vinculo?: { tipo: "fornecedor" | "cliente" | "colaborador" | "imobilizado"; id: string };
}) {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const [titulo, setTitulo] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [numero, setNumero] = useState("");
  const [emissor, setEmissor] = useState("");
  const [emissao, setEmissao] = useState("");
  const [validade, setValidade] = useState("");
  const [descricao, setDescricao] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [tags, setTags] = useState("");
  const [confidencial, setConfidencial] = useState(false);
  const [acessoIds, setAcessoIds] = useState<Set<string>>(new Set());
  const [vincTipo, setVincTipo] = useState<string>(vinculo?.tipo ?? "");
  const [vincId, setVincId] = useState<string>(vinculo?.id ?? "");

  useEffect(() => {
    fetch("/api/documentos/categorias").then((r) => r.json()).then((j) => {
      setCategorias((j.data ?? []).filter((c: Categoria & { ativo: boolean }) => c.ativo !== false));
    }).catch(() => {});
    fetch("/api/documentos/lookups").then((r) => r.json()).then((j) => setLookups(j.data ?? null)).catch(() => {});
  }, []);

  const categoria = categorias.find((c) => c.id === categoriaId);
  const opcoesVinculo: Opcao[] =
    vincTipo === "fornecedor" ? lookups?.fornecedores ?? [] :
    vincTipo === "cliente" ? lookups?.clientes ?? [] :
    vincTipo === "colaborador" ? lookups?.colaboradores ?? [] :
    vincTipo === "imobilizado" ? lookups?.imobilizados ?? [] : [];

  async function salvar() {
    if (!titulo.trim()) { setErro("Informe o título."); return; }
    if (!categoriaId) { setErro("Escolha a categoria."); return; }
    if (!file) { setErro("Anexe o arquivo do documento."); return; }
    if (categoria?.exigeValidade && !validade) { setErro(`A categoria "${categoria.nome}" exige validade.`); return; }
    setSalvando(true); setErro("");

    const fd = new FormData();
    fd.set("file", file);
    fd.set("titulo", titulo.trim());
    fd.set("categoriaId", categoriaId);
    if (numero) fd.set("numero", numero);
    if (emissor) fd.set("emissor", emissor);
    if (emissao) fd.set("emissao", emissao);
    if (validade) fd.set("validade", validade);
    if (descricao) fd.set("descricao", descricao);
    if (responsavelId) fd.set("responsavelId", responsavelId);
    if (tags) fd.set("tags", tags);
    fd.set("confidencial", String(confidencial));
    if (confidencial && acessoIds.size > 0) fd.set("acessoIds", Array.from(acessoIds).join(","));
    if (vincTipo && vincId) fd.set(`${vincTipo}Id`, vincId);

    try {
      const res = await fetch("/api/documentos", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro ao salvar."); return; }
      onCriado(json.data.id);
    } catch {
      setErro("Erro de conexão.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget && !salvando) onFechar(); }}>
      <EscClose onClose={() => { if (!salvando) onFechar(); }} />
      <div className="bg-card h-full w-full max-w-xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Novo documento</h2>
          <button onClick={onFechar} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Upload */}
          <div
            onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); }}
            className={cn(
              "border-2 border-dashed rounded-xl px-4 py-6 text-center transition-colors",
              arrastando ? "border-info bg-info/5" : "border-border bg-muted/40"
            )}
          >
            <UploadCloud className="w-6 h-6 mx-auto text-muted-foreground mb-1.5" />
            {file ? (
              <p className="text-sm text-foreground font-medium">{file.name} <button className="text-xs text-danger ml-1" onClick={() => setFile(null)}>remover</button></p>
            ) : (
              <label className="text-sm text-muted-foreground cursor-pointer">
                Clique ou arraste o arquivo aqui (máx. 20 MB)
                <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Título <span className="text-red-500">*</span></Label>
            <Input autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder='Ex.: "CND Federal", "Licença de Operação nº 123"' />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Categoria <span className="text-red-500">*</span></Label>
              <SelectMenu
                value={categoriaId}
                onChange={setCategoriaId}
                placeholder="Selecionar..."
                options={categorias.map((c) => ({ value: c.id, label: c.nome }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Número</Label>
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="nº certidão/apólice/contrato" />
            </div>
            <div className="space-y-1.5">
              <Label>Emissor</Label>
              <Input value={emissor} onChange={(e) => setEmissor(e.target.value)} placeholder="Receita Federal, SEMA..." />
            </div>
            <div className="space-y-1.5">
              <Label>Responsável (recebe alertas)</Label>
              <ComboboxWithCreate
                value={responsavelId}
                onChange={setResponsavelId}
                noneLabel="— Ninguém —"
                triggerClassName="h-9 rounded-lg"
                menuMinWidth={300}
                options={(lookups?.usuarios ?? []).map((u) => ({ value: u.id, label: u.nome }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Emissão</Label>
              <DatePicker value={emissao} onChange={setEmissao} />
            </div>
            <div className="space-y-1.5">
              <Label>Validade {categoria?.exigeValidade && <span className="text-red-500">*</span>}</Label>
              <DatePicker value={validade} onChange={setValidade} />
            </div>
          </div>

          {/* Vínculo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Vincular a</Label>
              <SelectMenu
                value={vincTipo}
                onChange={(v) => { setVincTipo(v); setVincId(""); }}
                disabled={!!vinculo}
                options={[
                  { value: "", label: "— Nada —" },
                  { value: "fornecedor", label: "Fornecedor" },
                  { value: "cliente", label: "Cliente" },
                  { value: "colaborador", label: "Colaborador" },
                  { value: "imobilizado", label: "Bem / Veículo" },
                ]}
              />
            </div>
            {vincTipo && (
              <div className="space-y-1.5">
                <Label>Registro</Label>
                <ComboboxWithCreate
                  value={vincId}
                  onChange={setVincId}
                  disabled={!!vinculo}
                  noneLabel="Selecionar..."
                  triggerClassName="h-9 rounded-lg"
                  menuMinWidth={320}
                  options={opcoesVinculo.map((o) => ({ value: o.id, label: o.nome }))}
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Tags (separadas por vírgula)</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="licitação, ambiental..." />
          </div>

          {/* Confidencial */}
          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input type="checkbox" checked={confidencial} onChange={(e) => setConfidencial(e.target.checked)} className="rounded" />
            <Lock className="w-3.5 h-3.5 text-muted-foreground" /> Confidencial — só quem for listado (e admins) vê
          </label>
          {confidencial && (
            <div className="max-h-40 overflow-y-auto border border-border rounded-lg divide-y divide-border">
              {(lookups?.usuarios ?? []).map((u) => (
                <label key={u.id} className="flex items-center gap-2.5 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={acessoIds.has(u.id)}
                    onChange={(e) => setAcessoIds((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(u.id); else next.delete(u.id);
                      return next;
                    })}
                  />
                  {u.nome}
                </label>
              ))}
            </div>
          )}

          {erro && <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{erro}</p>}
        </div>

        <div className="px-6 py-4 border-t border-border bg-muted flex justify-end gap-2">
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando} className="bg-blue-600 hover:bg-blue-700">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UploadCloud className="w-4 h-4 mr-2" />} Salvar documento
          </Button>
        </div>
      </div>
    </div>
  );
}
