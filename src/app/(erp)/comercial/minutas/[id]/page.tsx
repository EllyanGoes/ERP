"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle, ArrowRight, AlertCircle, Pencil, Save } from "lucide-react";
import { useTabTitle } from "@/lib/tabs-context";
import { useSession } from "@/lib/session-context";
import { statusMinutaLabel, confirmacaoMinutaLabel, TIPO_MINUTA_LABEL, type TipoMinuta } from "@/lib/minuta-labels";
import { cn } from "@/lib/utils";

type StatusMinuta = "PENDENTE" | "SAIU_PARA_ENTREGA" | "ENTREGUE" | "CANCELADA";

type MinutaItem = {
  id: string;
  itemId: string;
  pedidoVendaItemId: string;
  quantidade: string;
  quantidadeConvertida: string | null;
  item: { id: string; codigo: string; descricao: string };
  unidade: { id: string; sigla: string; nome: string } | null;
  pedidoVendaItem: { id: string; quantidade: string };
};

type LocalEstoque = { id: string; nome: string };
type Motorista = { id: string; nome: string };

type Minuta = {
  id: string;
  numero: string;
  numeroFisico: string | null;
  tipo: TipoMinuta;
  status: StatusMinuta;
  dataEmissao: string;
  dataEntrega: string | null;
  motorista: { id: string; nome: string } | null;
  placa: string | null;
  observacoes: string | null;
  pedidoVenda: {
    id: string;
    numero: string;
    cliente: { id: string; razaoSocial: string; nomeFantasia: string | null };
  };
  localEstoque: LocalEstoque | null;
  itens: MinutaItem[];
};

const STATUS_COLOR: Record<StatusMinuta, string> = {
  PENDENTE:          "bg-amber-100 text-amber-700 border border-amber-200",
  SAIU_PARA_ENTREGA: "bg-blue-100 text-blue-700 border border-blue-200",
  ENTREGUE:          "bg-emerald-100 text-emerald-700 border border-emerald-200",
  CANCELADA:         "bg-gray-100 text-gray-500 border border-gray-200",
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

function fmtQty(n: string | number) {
  return parseFloat(n.toString()).toLocaleString("pt-BR", {
    minimumFractionDigits: 0, maximumFractionDigits: 3,
  });
}

export default function MinutaDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useSession();
  const isAdmin = user?.perfil === "ADMIN";
  const [minuta, setMinuta] = useState<Minuta | null>(null);
  const [locais, setLocais] = useState<LocalEstoque[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState("");

  // For SAIU_PARA_ENTREGA confirmation: require localEstoqueId if not set
  const [saindoLocalId, setSaindoLocalId] = useState("");
  const [showSaidaModal, setShowSaidaModal] = useState(false);

  // Edit mode — disponível para todos enquanto não finalizada;
  // administradores podem editar em qualquer status (inclusive Entregue/Cancelada).
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [eNumeroFisico, setENumeroFisico]   = useState("");
  const [eTipo, setETipo]                    = useState<TipoMinuta>("ENTREGA");
  const [eDataEntrega, setEDataEntrega]      = useState("");
  const [eMotoristaId, setEMotoristaId]      = useState("");
  const [ePlaca, setEPlaca]                  = useState("");
  const [eLocalEstoqueId, setELocalEstoqueId] = useState("");
  const [eObservacoes, setEObservacoes]      = useState("");

  useTabTitle(minuta?.numero ?? "Minuta");

  const load = useCallback(async () => {
    try {
      const [minRes, locRes, motRes] = await Promise.all([
        fetch(`/api/comercial/minutas/${params.id}`),
        fetch("/api/suprimentos/locais-estoque?ativo=true"),
        fetch("/api/comercial/motoristas?ativo=true"),
      ]);
      const [minJson, locJson, motJson] = await Promise.all([minRes.json(), locRes.json(), motRes.json()]);
      setMinuta(minJson.data);
      setLocais(Array.isArray(locJson) ? locJson : (locJson.data ?? []));
      setMotoristas(Array.isArray(motJson) ? motJson : (motJson.data ?? []));
      setSaindoLocalId(minJson.data?.localEstoque?.id ?? "");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(newStatus: StatusMinuta, extra?: Record<string, string>) {
    setTransitioning(true); setError("");
    try {
      const res = await fetch(`/api/comercial/minutas/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Erro ao atualizar status"); return; }
      setMinuta(json.data);
      setShowSaidaModal(false);
    } finally {
      setTransitioning(false);
    }
  }

  function startEditing() {
    if (!minuta) return;
    setENumeroFisico(minuta.numeroFisico ?? "");
    setETipo(minuta.tipo);
    setEDataEntrega(minuta.dataEntrega ? minuta.dataEntrega.slice(0, 10) : "");
    setEMotoristaId(minuta.motorista?.id ?? "");
    setEPlaca(minuta.placa ?? "");
    setELocalEstoqueId(minuta.localEstoque?.id ?? "");
    setEObservacoes(minuta.observacoes ?? "");
    setError("");
    setEditing(true);
  }

  async function saveEdits() {
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/comercial/minutas/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numeroFisico:   eNumeroFisico,
          tipo:           eTipo,
          dataEntrega:    eDataEntrega || null,
          motoristaId:    eMotoristaId || null,
          placa:          ePlaca,
          localEstoqueId: eLocalEstoqueId || null,
          observacoes:    eObservacoes,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Erro ao salvar"); return; }
      setMinuta(json.data);
      setSaindoLocalId(json.data?.localEstoque?.id ?? "");
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="px-8 pb-8">
        <div className="h-20 animate-pulse bg-gray-100 rounded-xl" />
      </div>
    );
  }

  if (!minuta) {
    return <div className="px-8 pb-8 text-gray-500">Minuta não encontrada.</div>;
  }

  const isFinal = minuta.status === "ENTREGUE" || minuta.status === "CANCELADA";

  return (
    <div className="px-8 pb-8 space-y-6">
      <PageHeader
        title={minuta.numero}
        breadcrumbs={[
          { label: "Minutas", href: "/comercial/minutas" },
          { label: minuta.numero },
        ]}
        action={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-gray-100 text-gray-600 border border-gray-200">
              {TIPO_MINUTA_LABEL[minuta.tipo] ?? "Entrega"}
            </span>
            <span className={cn("inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold", STATUS_COLOR[minuta.status])}>
              {statusMinutaLabel(minuta.status, minuta.tipo)}
            </span>
          </div>
        }
      />

      {/* Action buttons */}
      {editing ? (
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            onClick={saveEdits}
            disabled={saving}
            className="gap-2 font-semibold bg-blue-600 hover:bg-blue-700"
          >
            <Save className="w-4 h-4" />
            {saving ? "Salvando..." : "Salvar Alterações"}
          </Button>
          <Button
            variant="outline"
            onClick={() => { setEditing(false); setError(""); }}
            disabled={saving}
            className="border-gray-300 text-gray-600"
          >
            Cancelar
          </Button>
        </div>
      ) : (!isFinal || isAdmin) && (
        <div className="flex items-center gap-3 flex-wrap">
          {minuta.status === "PENDENTE" && (
            <Button
              onClick={() => {
                if (!minuta.localEstoque) {
                  setShowSaidaModal(true);
                } else {
                  changeStatus("SAIU_PARA_ENTREGA");
                }
              }}
              disabled={transitioning}
              className="gap-2 font-semibold bg-blue-600 hover:bg-blue-700"
            >
              <ArrowRight className="w-4 h-4" />
              Registrar Saída
            </Button>
          )}
          {minuta.status === "SAIU_PARA_ENTREGA" && (
            <Button
              onClick={() => changeStatus("ENTREGUE")}
              disabled={transitioning}
              className="gap-2 font-semibold bg-emerald-600 hover:bg-emerald-700"
            >
              <CheckCircle2 className="w-4 h-4" />
              {confirmacaoMinutaLabel(minuta.tipo)}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={startEditing}
            disabled={transitioning}
            className="gap-2 border-gray-300 text-gray-700"
          >
            <Pencil className="w-4 h-4" />
            Editar
          </Button>
          {minuta.status === "PENDENTE" && (
            <>
              <span className="w-px h-6 bg-gray-200" />
              <Button
                variant="ghost"
                onClick={() => changeStatus("CANCELADA")}
                disabled={transitioning}
                className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <XCircle className="w-4 h-4" />
                Cancelar Minuta
              </Button>
            </>
          )}
        </div>
      )}

      {/* SAIDA modal — choose local if not set */}
      {showSaidaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl p-6 max-w-sm w-full space-y-4">
            <h3 className="font-bold text-gray-800">Selecionar Local de Estoque</h3>
            <p className="text-sm text-gray-600">
              Escolha o local de onde os itens sairão para registrar o movimento de estoque.
            </p>
            <Select value={saindoLocalId} onValueChange={setSaindoLocalId}>
              <SelectTrigger className="h-10 border-gray-300">
                <SelectValue placeholder="Selecione o local..." />
              </SelectTrigger>
              <SelectContent>
                {locais.map(l => (
                  <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <Button
                onClick={() => {
                  if (!saindoLocalId) { setError("Selecione o local de estoque"); return; }
                  changeStatus("SAIU_PARA_ENTREGA", { localEstoqueId: saindoLocalId });
                }}
                disabled={transitioning || !saindoLocalId}
                className="flex-1 font-semibold"
              >
                {transitioning ? "Processando..." : "Confirmar Saída"}
              </Button>
              <Button variant="outline" onClick={() => setShowSaidaModal(false)} className="border-gray-300">
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !showSaidaModal && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">

        {/* LEFT — dados principais */}
        <div className="col-span-2 space-y-4">

          {/* Info card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="font-bold text-sm text-gray-800 uppercase tracking-wide">Dados da Minuta</h2>
            </div>
            {editing ? (
              <div className="p-5 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Pedido de Venda</div>
                  <div className="font-mono font-semibold text-gray-700">{minuta.pedidoVenda.numero}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cliente</div>
                  <div className="text-gray-800 font-medium">
                    {minuta.pedidoVenda.cliente.nomeFantasia || minuta.pedidoVenda.cliente.razaoSocial}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tipo</label>
                  <Select value={eTipo} onValueChange={(v) => setETipo(v as TipoMinuta)}>
                    <SelectTrigger className="h-10 border-gray-300"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ENTREGA">{TIPO_MINUTA_LABEL.ENTREGA}</SelectItem>
                      <SelectItem value="RETIRADA">{TIPO_MINUTA_LABEL.RETIRADA}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Local de Estoque</label>
                  {minuta.status === "PENDENTE" ? (
                    <Select value={eLocalEstoqueId} onValueChange={setELocalEstoqueId}>
                      <SelectTrigger className="h-10 border-gray-300"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {locais.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-gray-400 italic">Nenhum local cadastrado</div>
                        ) : locais.map(l => (
                          <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="text-gray-800 pt-2">
                      {minuta.localEstoque?.nome ?? "—"}
                      {(minuta.status === "SAIU_PARA_ENTREGA" || minuta.status === "ENTREGUE") && (
                        <span className="ml-1 text-xs text-gray-400">(estoque já baixado)</span>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data de Emissão</div>
                  <div className="text-gray-800 pt-2">{fmtDate(minuta.dataEmissao)}</div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data de {eTipo === "RETIRADA" ? "Retirada" : "Entrega"}</label>
                  <Input type="date" value={eDataEntrega} onChange={e => setEDataEntrega(e.target.value)} className="h-10 border-gray-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Motorista</label>
                  <Select value={eMotoristaId} onValueChange={setEMotoristaId}>
                    <SelectTrigger className="h-10 border-gray-300"><SelectValue placeholder="Selecione o motorista..." /></SelectTrigger>
                    <SelectContent>
                      {motoristas.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-gray-400 italic">Nenhum motorista cadastrado</div>
                      ) : motoristas.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Placa</label>
                  <Input value={ePlaca} onChange={e => setEPlaca(e.target.value)} className="h-10 border-gray-300" placeholder="AAA-0000" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nº da Minuta Física</label>
                  <Input value={eNumeroFisico} onChange={e => setENumeroFisico(e.target.value)} className="h-10 border-gray-300" placeholder="Número do bloco físico" />
                </div>
              </div>
            ) : (
            <div className="p-5 grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Pedido de Venda</div>
                <button
                  onClick={() => router.push(`/pedidos-venda/${minuta.pedidoVenda.id}`)}
                  className="font-mono font-semibold text-blue-600 hover:underline"
                >
                  {minuta.pedidoVenda.numero}
                </button>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cliente</div>
                <div className="text-gray-800 font-medium">
                  {minuta.pedidoVenda.cliente.nomeFantasia || minuta.pedidoVenda.cliente.razaoSocial}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Local de Estoque</div>
                <div className="text-gray-800">{minuta.localEstoque?.nome ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data de Emissão</div>
                <div className="text-gray-800">{fmtDate(minuta.dataEmissao)}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data de {minuta.tipo === "RETIRADA" ? "Retirada" : "Entrega"}</div>
                <div className="text-gray-800">{fmtDate(minuta.dataEntrega)}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Motorista</div>
                <div className="text-gray-800">{minuta.motorista?.nome ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Placa</div>
                <div className="text-gray-800">{minuta.placa ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nº da Minuta Física</div>
                <div className="text-gray-800">{minuta.numeroFisico ?? "—"}</div>
              </div>
            </div>
            )}
          </div>

          {/* Items table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="font-bold text-sm text-gray-800 uppercase tracking-wide">Itens</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-gray-500">Produto</th>
                  <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-xs text-gray-500 w-36">Quantidade</th>
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-gray-500 w-24">Unidade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {minuta.itens.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 align-middle">
                      <div className="font-medium text-gray-800">{item.item.descricao}</div>
                      <div className="text-xs text-gray-400">{item.item.codigo}</div>
                    </td>
                    <td className="px-4 py-3 text-right align-middle tabular-nums text-gray-800">
                      {item.quantidadeConvertida && item.unidade ? (
                        <div>
                          <span className="font-semibold">{fmtQty(item.quantidadeConvertida)}</span>
                          <span className="text-gray-400 ml-1 text-xs">{item.unidade.sigla}</span>
                          <div className="text-xs text-gray-400">
                            = {fmtQty(item.quantidade)} UN
                          </div>
                        </div>
                      ) : (
                        <span className="font-semibold">{fmtQty(item.quantidade)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle text-gray-500">
                      {item.unidade?.sigla ?? "UN"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT — observações */}
        <div className="col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="font-bold text-sm text-gray-800 uppercase tracking-wide">Observações</h2>
            </div>
            <div className="p-5">
              {editing ? (
                <Textarea
                  value={eObservacoes}
                  onChange={e => setEObservacoes(e.target.value)}
                  rows={4}
                  placeholder={`Observações sobre a ${eTipo === "RETIRADA" ? "retirada" : "entrega"}...`}
                  className="resize-none border-gray-300"
                />
              ) : minuta.observacoes ? (
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{minuta.observacoes}</p>
              ) : (
                <p className="text-sm text-gray-400 italic">Sem observações.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
