"use client";

import { X, Trash2, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLATAFORMAS_CAMPANHA } from "@/lib/validations/marketing-campanha";
import type { TipoFunilNo } from "@/lib/validations/marketing-funil";
import { NODE_STYLE, PLATAFORMA_STYLE, PLATAFORMA_LABEL } from "./nodes";
import type { CampanhaOpt, EtapaLeadOpt, FunilNodeData } from "./types";

const inputCls = "w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500";
const labelCls = "block text-[11px] font-medium text-muted-foreground mb-1";

interface Props {
  tipo: TipoFunilNo;
  data: FunilNodeData;
  campanhas: CampanhaOpt[];
  etapas: EtapaLeadOpt[];
  onChange: (patch: Partial<FunilNodeData>) => void;
  onLancarMetricas: () => void;
  onClose: () => void;
  onDelete: () => void;
}

export default function NoConfigSheet({ tipo, data, campanhas, etapas, onChange, onLancarMetricas, onClose, onDelete }: Props) {
  const s = NODE_STYLE[tipo];
  const plat = tipo === "FONTE" && data.plataforma ? PLATAFORMA_STYLE[data.plataforma] ?? PLATAFORMA_STYLE.OUTRO : null;
  const HeaderIcon = plat?.icon ?? s.icon;

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-card border-l border-border shadow-xl z-20 flex flex-col">
      <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("flex w-6 h-6 items-center justify-center rounded-md", plat?.chipBg ?? s.chipBg, plat?.chipText ?? s.chipText)}>
            <HeaderIcon className="w-3.5 h-3.5" />
          </span>
          <span className="text-sm font-semibold text-foreground truncate">{s.label}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg text-muted-foreground hover:bg-muted" title="Fechar">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div>
          <label className={labelCls}>Rótulo</label>
          <input
            className={inputCls}
            value={data.rotulo ?? ""}
            onChange={(e) => onChange({ rotulo: e.target.value })}
            placeholder={tipo === "FONTE" ? "ex.: Anúncio institucional" : tipo === "PAGINA" ? "ex.: Landing page" : tipo === "ACAO" ? "ex.: Clique no WhatsApp" : "ex.: Orçamento enviado"}
          />
        </div>

        {tipo === "FONTE" && (
          <>
            <div>
              <label className={labelCls}>Plataforma</label>
              <select
                className={inputCls}
                value={data.plataforma ?? ""}
                onChange={(e) => onChange({ plataforma: e.target.value || null })}
              >
                <option value="">—</option>
                {PLATAFORMAS_CAMPANHA.map((p) => (
                  <option key={p} value={p}>{PLATAFORMA_LABEL[p] ?? p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Campanha vinculada</label>
              <select
                className={inputCls}
                value={data.campanhaId ?? ""}
                onChange={(e) => onChange({ campanhaId: e.target.value || null })}
              >
                <option value="">—</option>
                {campanhas.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Vincule para puxar as métricas da campanha automaticamente.
              </p>
            </div>
          </>
        )}

        {tipo === "PAGINA" && (
          <div>
            <label className={labelCls}>Padrões de URL</label>
            <textarea
              className={cn(inputCls, "min-h-24 font-mono text-xs")}
              value={(data.urlPatterns ?? []).join("\n")}
              onChange={(e) => onChange({ urlPatterns: e.target.value.split("\n") })}
              placeholder={"/landing-page\n/obrigado*"}
            />
            <p className="text-[10px] text-muted-foreground mt-1">Um padrão por linha — use * como curinga.</p>
          </div>
        )}

        {tipo === "ACAO" && (
          <div>
            <label className={labelCls}>Nome do evento</label>
            <input
              className={inputCls}
              value={data.eventoNome ?? ""}
              onChange={(e) => onChange({ eventoNome: e.target.value || null })}
              placeholder="ex.: clique_whatsapp"
            />
          </div>
        )}

        {tipo === "ETAPA_OFFLINE" && (
          <div>
            <label className={labelCls}>Etapa de lead</label>
            <select
              className={inputCls}
              value={data.etapaLeadId ?? ""}
              onChange={(e) => onChange({ etapaLeadId: e.target.value || null })}
            >
              <option value="">—</option>
              {etapas.map((et) => (
                <option key={et.id} value={et.id}>{et.nome}{et.ganho ? " (ganho)" : ""}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={labelCls}>Valor médio (R$)</label>
          <input
            className={inputCls}
            inputMode="decimal"
            value={data.valorMedio == null ? "" : String(data.valorMedio)}
            onChange={(e) => {
              const v = e.target.value.replace(",", ".").trim();
              if (v === "") { onChange({ valorMedio: null }); return; }
              const n = Number(v);
              if (Number.isFinite(n) && n >= 0) onChange({ valorMedio: n });
            }}
            placeholder="ticket médio deste nó"
          />
          <p className="text-[10px] text-muted-foreground mt-1">Usado na receita projetada do forecast (Fase 2).</p>
        </div>

        <button
          onClick={onLancarMetricas}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
        >
          <BarChart3 className="w-4 h-4" /> Lançar métricas
        </button>
      </div>

      <div className="p-3 border-t border-border shrink-0">
        <button onClick={onDelete} className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-danger/30 text-danger px-3 py-2 text-sm hover:bg-danger/10">
          <Trash2 className="w-4 h-4" /> Remover nó
        </button>
      </div>
    </div>
  );
}
