"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatusBadge from "@/components/shared/StatusBadge";
import { Autoria } from "@/components/shared/Autoria";
import { formatDate, decimalToNumber } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";

type Necessidade = {
  id: string;
  numero: string;
  status: string;
  solicitante: string | null;
  justificativa: string | null;
  dataNecessidade: string | null;
  observacoes: string | null;
  aprovadoPor: string | null;
  dataAprovacao: string | null;
  motivoReprovacao: string | null;
  criadoPor?: string | null;
  atualizadoPor?: string | null;
  itens: Array<{
    id: string;
    quantidade: unknown;
    quantidadeAprovada: unknown;
    observacao: string | null;
    item: { id: string; codigo: string; descricao: string; unidadeMedida: string };
  }>;
  cotacoes: Array<{ id: string; numero: string; status: string }>;
};

export default function NecessidadeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [necessidade, setNecessidade] = useState<Necessidade | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actioning, setActioning] = useState(false);

  // Approval fields
  const [motivoReprovacao, setMotivoReprovacao] = useState("");
  const [showApproveForm, setShowApproveForm] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/suprimentos/necessidades/${id}`);
      const json = await res.json();
      setNecessidade(json.data);
    } catch {
      setError("Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(status: string, extra?: Record<string, string>) {
    setActioning(true);
    setActionError("");
    try {
      const res = await fetch(`/api/suprimentos/necessidades/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error || "Erro na operação");
        return;
      }
      setShowApproveForm(false);
      setShowRejectForm(false);
      await load();
    } catch {
      setActionError("Erro de conexão");
    } finally {
      setActioning(false);
    }
  }

  async function gerarCotacao() {
    setActioning(true);
    setActionError("");
    try {
      const res = await fetch("/api/suprimentos/cotacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          necessidadeId: id,
          fornecedorIds: [],
          itens: necessidade?.itens.map((i) => ({
            itemId: i.item.id,
            quantidade: decimalToNumber(i.quantidadeAprovada ?? i.quantidade),
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error || "Erro ao gerar cotação");
        return;
      }
      router.push(`/suprimentos/cotacoes/${json.data.id}`);
    } catch {
      setActionError("Erro de conexão");
    } finally {
      setActioning(false);
    }
  }

  // Set tab title dynamically
  useTabTitle(necessidade ? `Necessidade ${necessidade.numero}` : null);

  if (loading) return <div className="px-8 pt-8 text-muted-foreground">Carregando...</div>;
  if (!necessidade) return <div className="px-8 pt-8 text-red-500">{error || "Não encontrado"}</div>;

  return (
    <div>
      <PageHeader
        title={`Necessidade ${necessidade.numero}`}
        breadcrumbs={[
          { label: "Suprimentos" },
          { label: "Necessidades", href: "/suprimentos/necessidades" },
          { label: necessidade.numero },
        ]}
        action={<StatusBadge status={necessidade.status} />}
      />
      <div className="px-8 pb-8 space-y-6 max-w-5xl">
        {actionError && (
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm">{actionError}</div>
        )}

        {/* Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informações</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Solicitante</p>
              <p className="text-sm font-medium">{necessidade.solicitante || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Data de Necessidade</p>
              <p className="text-sm font-medium">{formatDate(necessidade.dataNecessidade)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <div className="mt-1">
                <StatusBadge status={necessidade.status} />
              </div>
            </div>
            {necessidade.justificativa && (
              <div className="md:col-span-3">
                <p className="text-xs text-muted-foreground">Justificativa</p>
                <p className="text-sm text-foreground mt-1">{necessidade.justificativa}</p>
              </div>
            )}
            <Autoria criadoPor={necessidade.criadoPor} atualizadoPor={necessidade.atualizadoPor} className="md:col-span-3" />
          </CardContent>
        </Card>

        {/* Approval info */}
        {(necessidade.status === "APROVADA" || necessidade.status === "REJEITADA") && (
          <Card className={necessidade.status === "APROVADA" ? "border-success/30 bg-success/10" : "border-danger/30 bg-danger/10"}>
            <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              {necessidade.status === "APROVADA" && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground">Aprovado por</p>
                    <p className="text-sm font-medium">{necessidade.aprovadoPor || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Data de Aprovação</p>
                    <p className="text-sm font-medium">{formatDate(necessidade.dataAprovacao)}</p>
                  </div>
                </>
              )}
              {necessidade.status === "REJEITADA" && (
                <div className="md:col-span-3">
                  <p className="text-xs text-danger">Motivo da Rejeição</p>
                  <p className="text-sm text-danger mt-1">{necessidade.motivoReprovacao || "—"}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Itens Solicitados</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Código</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Descrição</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Qtd. Solicitada</th>
                  {necessidade.status === "APROVADA" && (
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Qtd. Aprovada</th>
                  )}
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {necessidade.itens.map((item) => (
                  <tr key={item.id} className="hover:bg-muted">
                    <td className="px-4 py-3 font-mono text-xs">{item.item.codigo}</td>
                    <td className="px-4 py-3">{item.item.descricao}</td>
                    <td className="px-4 py-3 text-right">
                      {decimalToNumber(item.quantidade).toLocaleString("pt-BR", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 3,
                      })}{" "}
                      {item.item.unidadeMedida}
                    </td>
                    {necessidade.status === "APROVADA" && (
                      <td className="px-4 py-3 text-right text-success font-medium">
                        {item.quantidadeAprovada
                          ? decimalToNumber(item.quantidadeAprovada).toLocaleString("pt-BR")
                          : "—"}
                      </td>
                    )}
                    <td className="px-4 py-3 text-muted-foreground text-xs">{item.observacao || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Cotações link */}
        {necessidade.cotacoes?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cotações Geradas</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {necessidade.cotacoes.map((c) => (
                <Link
                  key={c.id}
                  href={`/suprimentos/cotacoes/${c.id}`}
                  className="inline-flex items-center gap-1 text-sm text-info hover:underline border border-info/30 rounded px-3 py-1"
                >
                  {c.numero} — <StatusBadge status={c.status} />
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Action buttons */}
        <div className="space-y-4">
          {necessidade.status === "RASCUNHO" && (
            <Button
              onClick={() => changeStatus("AGUARDANDO_APROVACAO")}
              disabled={actioning}
            >
              {actioning ? "Enviando..." : "Enviar para Aprovação"}
            </Button>
          )}

          {necessidade.status === "AGUARDANDO_APROVACAO" && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="border-green-500 text-success hover:bg-success/10"
                  onClick={() => { setShowApproveForm(true); setShowRejectForm(false); }}
                >
                  Aprovar
                </Button>
                <Button
                  variant="outline"
                  className="border-red-500 text-danger hover:bg-danger/10"
                  onClick={() => { setShowRejectForm(true); setShowApproveForm(false); }}
                >
                  Reprovar
                </Button>
              </div>

              {showApproveForm && (
                <Card className="border-success/30">
                  <CardContent className="pt-4 space-y-3">
                    <p className="text-sm text-muted-foreground">
                      A aprovação será registrada em nome do usuário logado.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => changeStatus("APROVADA")}
                        disabled={actioning}
                      >
                        {actioning ? "Aprovando..." : "Confirmar Aprovação"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowApproveForm(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {showRejectForm && (
                <Card className="border-danger/30">
                  <CardContent className="pt-4 space-y-3">
                    <div className="space-y-1.5">
                      <Label>Motivo da Rejeição</Label>
                      <Input
                        value={motivoReprovacao}
                        onChange={(e) => setMotivoReprovacao(e.target.value)}
                        placeholder="Descreva o motivo..."
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => changeStatus("REJEITADA", { motivoReprovacao })}
                        disabled={actioning}
                      >
                        {actioning ? "Reprovando..." : "Confirmar Reprovação"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowRejectForm(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {necessidade.status === "APROVADA" && (
            <Button onClick={gerarCotacao} disabled={actioning}>
              {actioning ? "Gerando..." : "Gerar Cotação de Compra"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
