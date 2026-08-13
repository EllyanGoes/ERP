"use client";

// Configurações do projeto (dono/ADMIN): dados, membros, etiquetas, arquivar/excluir.
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import EscClose from "@/components/shared/EscClose";
import { useSession } from "@/lib/session-context";
import { Loader2, X, Trash2, Archive, Plus, Shield, ShieldOff } from "lucide-react";
import { AvatarUsuario } from "./comum";
import SelectMenu from "@/components/shared/SelectMenu";
import { ProjetoBoardDTO, CORES_PROJETO } from "./tipos";

type UsuarioOption = { id: string; nome: string };

export default function ProjetoConfigDialog({
  board, onFechar, onMudou, onExcluido,
}: {
  board: ProjetoBoardDTO;
  onFechar: () => void;
  onMudou: () => void;
  onExcluido: () => void;
}) {
  const { user } = useSession();
  const souDono = user?.id === board.donoId || user?.perfil === "ADMIN";

  const [nome, setNome] = useState(board.nome);
  const [descricao, setDescricao] = useState(board.descricao ?? "");
  const [cor, setCor] = useState(board.cor ?? CORES_PROJETO[0]);
  const [publico, setPublico] = useState(board.visibilidade === "PUBLICO");
  // Projeto por empresa (ou geral) — mesmas opções do criar.
  const [empresaId, setEmpresaId] = useState(board.empresaId ?? "");
  const empresasSessao = user?.empresas ?? [];
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [usuarios, setUsuarios] = useState<UsuarioOption[]>([]);
  const [novoMembro, setNovoMembro] = useState("");
  const [confirmaExcluir, setConfirmaExcluir] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    fetch("/api/projetos/usuarios")
      .then((r) => r.json())
      .then((j) => setUsuarios(j.data ?? []))
      .catch(() => {});
  }, []);

  async function salvar() {
    if (!nome.trim()) { setErro("Informe o nome."); return; }
    setSalvando(true); setErro("");
    const res = await fetch(`/api/projetos/${board.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: nome.trim(), descricao: descricao.trim() || null, cor, visibilidade: publico ? "PUBLICO" : "PRIVADO", empresaId: empresaId || null }),
    }).catch(() => null);
    setSalvando(false);
    if (!res?.ok) {
      const json = await res?.json().catch(() => ({}));
      setErro(json?.error || "Erro ao salvar.");
      return;
    }
    onMudou();
    onFechar();
  }

  async function adicionarMembro() {
    if (!novoMembro) return;
    await fetch(`/api/projetos/${board.id}/membros`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuarioIds: [novoMembro] }),
    }).catch(() => {});
    setNovoMembro("");
    onMudou();
  }

  async function removerMembro(usuarioId: string) {
    await fetch(`/api/projetos/${board.id}/membros?usuarioId=${usuarioId}`, { method: "DELETE" }).catch(() => {});
    onMudou();
  }

  async function alternarPapel(usuarioId: string, papel: string) {
    await fetch(`/api/projetos/${board.id}/membros`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuarioId, papel: papel === "ADMIN" ? "MEMBRO" : "ADMIN" }),
    }).catch(() => {});
    onMudou();
  }

  async function alternarArquivado() {
    await fetch(`/api/projetos/${board.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: board.status === "ARQUIVADO" ? "ATIVO" : "ARQUIVADO" }),
    }).catch(() => {});
    onMudou();
    onFechar();
  }

  async function excluir() {
    setExcluindo(true);
    const res = await fetch(`/api/projetos/${board.id}`, { method: "DELETE" }).catch(() => null);
    setExcluindo(false);
    if (res?.ok) onExcluido();
    else {
      const json = await res?.json().catch(() => ({}));
      setErro(json?.error || "Não foi possível excluir.");
      setConfirmaExcluir(false);
    }
  }

  const membrosIds = new Set(board.membros.map((m) => m.usuarioId));
  const candidatos = usuarios.filter((u) => !membrosIds.has(u.id));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}
    >
      <EscClose onClose={onFechar} />
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Configurações do projeto</h2>
          <button onClick={onFechar} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          <div className="space-y-1.5">
            <Label>Nome <span className="text-red-500">*</span></Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Cor</Label>
            <div className="flex gap-2 flex-wrap">
              {CORES_PROJETO.map((c) => (
                <button key={c} onClick={() => setCor(c)} className={cn("w-7 h-7 rounded-full transition-transform", cor === c && "ring-2 ring-offset-2 ring-blue-500 scale-110")} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input type="checkbox" checked={publico} onChange={(e) => setPublico(e.target.checked)} className="rounded" />
            Público — qualquer pessoa com o módulo pode ver (só membros editam)
          </label>

          {/* Empresa do projeto (ou Geral) — só p/ quem enxerga 2+ empresas */}
          {empresasSessao.length > 1 && (
            <div className="space-y-1.5">
              <Label>Empresa</Label>
              <SelectMenu
                value={empresaId}
                onChange={setEmpresaId}
                options={[
                  { value: "", label: "Geral (sem empresa)" },
                  ...empresasSessao.map((e) => ({ value: e.id, label: e.nome })),
                ]}
              />
            </div>
          )}

          {/* Membros */}
          <div className="space-y-1.5">
            <Label>Membros ({board.membros.length})</Label>
            <div className="border border-border rounded-lg divide-y divide-border max-h-52 overflow-y-auto">
              {board.membros.map((m) => (
                <div key={m.id} className="flex items-center gap-2.5 px-3 py-2">
                  <AvatarUsuario nome={m.usuario.nome} size="sm" />
                  <span className="text-sm text-foreground flex-1 truncate">
                    {m.usuario.nome}
                    {m.usuarioId === board.donoId && <span className="text-xs text-muted-foreground ml-1.5">(dono)</span>}
                    {m.papel === "ADMIN" && m.usuarioId !== board.donoId && <span className="text-xs text-info ml-1.5">(admin)</span>}
                  </span>
                  {m.usuarioId !== board.donoId && (
                    <>
                      <button
                        onClick={() => alternarPapel(m.usuarioId, m.papel)}
                        className="text-muted-foreground hover:text-info"
                        title={m.papel === "ADMIN" ? "Tornar membro comum" : "Tornar administrador"}
                      >
                        {m.papel === "ADMIN" ? <ShieldOff className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => removerMembro(m.usuarioId)} className="text-muted-foreground hover:text-danger" title="Remover">
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <SelectMenu
                value={novoMembro}
                onChange={setNovoMembro}
                placeholder="Adicionar membro..."
                className="flex-1"
                options={candidatos.map((u) => ({ value: u.id, label: u.nome }))}
              />
              <Button size="sm" variant="outline" onClick={adicionarMembro} disabled={!novoMembro}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {erro && <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{erro}</p>}

          {/* Zona perigosa */}
          {souDono && (
            <div className="pt-3 border-t border-border space-y-2">
              <button onClick={alternarArquivado} className="w-full flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg border border-border hover:bg-muted">
                <Archive className="w-4 h-4" /> {board.status === "ARQUIVADO" ? "Reativar projeto" : "Arquivar projeto"}
              </button>
              {confirmaExcluir ? (
                <div className="border border-danger/30 bg-danger/10 rounded-lg px-3 py-2.5 space-y-2">
                  <p className="text-sm text-danger">Excluir <b>{board.nome}</b> com todas as tarefas? Vai para a Lixeira do sistema (retenção 90 dias).</p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={excluir} disabled={excluindo} className="bg-red-600 hover:bg-red-700 text-white h-7 px-2.5 text-xs">
                      {excluindo ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Trash2 className="w-3 h-3 mr-1" />} Excluir definitivamente
                    </Button>
                    <button className="text-xs text-muted-foreground" onClick={() => setConfirmaExcluir(false)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmaExcluir(true)} className="w-full flex items-center gap-2 text-sm text-danger px-3 py-2 rounded-lg border border-danger/30 hover:bg-danger/10">
                  <Trash2 className="w-4 h-4" /> Excluir projeto
                </button>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border bg-muted rounded-b-2xl flex justify-end gap-2">
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando} className="bg-blue-600 hover:bg-blue-700">
            {salvando && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}
