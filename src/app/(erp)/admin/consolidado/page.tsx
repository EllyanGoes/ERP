"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL } from "@/lib/utils";
import { useSession } from "@/lib/session-context";
import { Building2, Loader2, ShieldAlert, TrendingUp, TrendingDown, Wallet, Package } from "lucide-react";

type Metrica = { total: number; intragrupo: number; quantidade: number };
type Linha = {
  id: string;
  nome: string;
  vendas: Metrica;
  compras: Metrica;
  receberAberto: Metrica;
  pagarAberto: Metrica;
  estoqueValor: number;
};
type Consolidado = {
  periodo: { de: string; ate: string };
  empresas: Linha[];
  grupo: {
    vendas: number;
    compras: number;
    receberAberto: number;
    pagarAberto: number;
    estoqueValor: number;
    eliminado: { vendas: number; compras: number; receberAberto: number; pagarAberto: number };
  };
};

function isoDia(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function ConsolidadoGrupoPage() {
  const { user } = useSession();
  const hoje = new Date();
  const [de, setDe] = useState(isoDia(new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), 1))));
  const [ate, setAte] = useState(isoDia(hoje));
  const [dados, setDados] = useState<Consolidado | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async (pDe: string, pAte: string) => {
    setLoading(true);
    setErro("");
    try {
      const res = await fetch(`/api/admin/consolidado?de=${pDe}&ate=${pAte}`);
      const json = await res.json();
      if (!res.ok) {
        setErro(json.error ?? "Erro ao carregar o consolidado");
        setDados(null);
      } else {
        setDados(json);
      }
    } catch {
      setErro("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar(de, ate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // carrega uma vez; depois só pelo botão Atualizar

  if (user && user.perfil !== "ADMIN") {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500 gap-2">
        <ShieldAlert className="w-8 h-8" />
        <p className="text-sm">Consolidado do grupo é restrito a administradores.</p>
      </div>
    );
  }

  const grupo = dados?.grupo;
  const cards = grupo
    ? [
        { titulo: "Vendas no período", valor: grupo.vendas, eliminado: grupo.eliminado.vendas, icon: TrendingUp, cor: "text-green-600" },
        { titulo: "Compras no período", valor: grupo.compras, eliminado: grupo.eliminado.compras, icon: TrendingDown, cor: "text-orange-600" },
        { titulo: "A receber em aberto", valor: grupo.receberAberto, eliminado: grupo.eliminado.receberAberto, icon: Wallet, cor: "text-blue-600" },
        { titulo: "A pagar em aberto", valor: grupo.pagarAberto, eliminado: grupo.eliminado.pagarAberto, icon: Wallet, cor: "text-red-600" },
        { titulo: "Estoque (custo)", valor: grupo.estoqueValor, eliminado: 0, icon: Package, cor: "text-gray-700" },
      ]
    : [];

  return (
    <div>
      <PageHeader
        title="Consolidado do Grupo"
        breadcrumbs={[{ label: "Administração" }, { label: "Consolidado do Grupo" }]}
        action={
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">De</Label>
              <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="h-8 w-36" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Até</Label>
              <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="h-8 w-36" />
            </div>
            <Button size="sm" onClick={() => carregar(de, ate)} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Atualizar"}
            </Button>
          </div>
        }
      />

      <div className="px-8 pb-12 space-y-6">
        <p className="text-xs text-gray-500 flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5" />
          Soma das empresas ativas do grupo, com as operações intragrupo eliminadas do total
          (vendas entre empresas do grupo não contam como receita do grupo).
        </p>

        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{erro}</div>
        )}

        {loading && !dados ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : dados && (
          <>
            {/* ── Cards do grupo ────────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {cards.map((c) => (
                <Card key={c.titulo}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                      <c.icon className={`w-3.5 h-3.5 ${c.cor}`} />
                      {c.titulo}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-semibold text-gray-900">{formatBRL(c.valor)}</p>
                    {c.eliminado > 0 && (
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        intragrupo eliminado: {formatBRL(c.eliminado)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* ── Quadro por empresa ───────────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Por empresa</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                      <th className="py-2 pr-4 font-medium">Empresa</th>
                      <th className="py-2 pr-4 font-medium text-right">Vendas</th>
                      <th className="py-2 pr-4 font-medium text-right">Compras</th>
                      <th className="py-2 pr-4 font-medium text-right">A receber</th>
                      <th className="py-2 pr-4 font-medium text-right">A pagar</th>
                      <th className="py-2 font-medium text-right">Estoque</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.empresas.map((l) => (
                      <tr key={l.id} className="border-b border-gray-100">
                        <td className="py-2 pr-4 font-medium text-gray-800">{l.nome}</td>
                        <td className="py-2 pr-4 text-right">{formatBRL(l.vendas.total)}</td>
                        <td className="py-2 pr-4 text-right">{formatBRL(l.compras.total)}</td>
                        <td className="py-2 pr-4 text-right">{formatBRL(l.receberAberto.total)}</td>
                        <td className="py-2 pr-4 text-right">{formatBRL(l.pagarAberto.total)}</td>
                        <td className="py-2 text-right">{formatBRL(l.estoqueValor)}</td>
                      </tr>
                    ))}
                    <tr className="border-b border-gray-100 text-gray-400">
                      <td className="py-2 pr-4">(−) Intragrupo</td>
                      <td className="py-2 pr-4 text-right">−{formatBRL(dados.grupo.eliminado.vendas)}</td>
                      <td className="py-2 pr-4 text-right">−{formatBRL(dados.grupo.eliminado.compras)}</td>
                      <td className="py-2 pr-4 text-right">−{formatBRL(dados.grupo.eliminado.receberAberto)}</td>
                      <td className="py-2 pr-4 text-right">−{formatBRL(dados.grupo.eliminado.pagarAberto)}</td>
                      <td className="py-2 text-right">—</td>
                    </tr>
                    <tr className="font-semibold text-gray-900">
                      <td className="py-2 pr-4">Grupo</td>
                      <td className="py-2 pr-4 text-right">{formatBRL(dados.grupo.vendas)}</td>
                      <td className="py-2 pr-4 text-right">{formatBRL(dados.grupo.compras)}</td>
                      <td className="py-2 pr-4 text-right">{formatBRL(dados.grupo.receberAberto)}</td>
                      <td className="py-2 pr-4 text-right">{formatBRL(dados.grupo.pagarAberto)}</td>
                      <td className="py-2 text-right">{formatBRL(dados.grupo.estoqueValor)}</td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
