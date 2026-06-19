"use client";
// Central de Documentação: explica cada módulo do sistema com os processos
// mapeados em simbologia BPMN (macro + micro), mostrando como se relacionam.
// Acessível pelo painel de Ajuda (tecla "?") → card "Documentação".
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import ProcessoDiagram from "@/components/documentacao/ProcessoDiagram";
import { MODULOS } from "@/lib/documentacao/conteudo";

export default function DocumentacaoPage() {
  const [ativoId, setAtivoId] = useState(MODULOS[0].id);
  const ativo = MODULOS.find((m) => m.id === ativoId) ?? MODULOS[0];

  return (
    <div>
      <PageHeader
        title="Documentação"
        subtitle="Como cada módulo funciona — processos mapeados em BPMN, do macro ao micro."
        breadcrumbs={[{ label: "Ajuda" }, { label: "Documentação" }]}
      />

      <div className="px-8 pb-12 flex gap-8 items-start">
        {/* Navegação por módulo */}
        <nav className="w-56 shrink-0 sticky top-6 space-y-1">
          {MODULOS.map((m) => {
            const Icon = m.icon;
            const ativoCls = m.id === ativoId;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setAtivoId(m.id)}
                className={
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors " +
                  (ativoCls
                    ? "bg-info/10 text-info"
                    : "text-muted-foreground hover:bg-muted")
                }
              >
                <Icon className={"h-4 w-4 shrink-0 " + (ativoCls ? "text-info" : "text-muted-foreground")} />
                {m.label}
              </button>
            );
          })}
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-info/10 px-3 py-2.5 text-[11px] text-info">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>Selecione um módulo para ver suas telas e os processos em BPMN.</span>
          </div>
        </nav>

        {/* Conteúdo do módulo */}
        <div className="flex-1 min-w-0 space-y-8">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <ativo.icon className="h-5 w-5 text-foreground" />
              <h2 className="text-xl font-semibold text-foreground">{ativo.label}</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">{ativo.resumo}</p>
          </div>

          {/* Telas relacionadas */}
          {ativo.telas.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Telas deste módulo
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ativo.telas.map((t) => (
                  <Link
                    key={t.href}
                    href={t.href}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-border p-3.5 hover:border-border hover:shadow-sm transition-all"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground group-hover:text-info transition-colors">{t.label}</p>
                      <p className="text-xs text-muted-foreground">{t.descricao}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/60 group-hover:text-blue-500 transition-colors" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Processos (BPMN) */}
          {ativo.processos.map((p) => (
            <div key={p.titulo}>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                Processo
              </p>
              <h3 className="text-base font-semibold text-foreground">{p.titulo}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl mt-1 mb-3">{p.texto}</p>
              <ProcessoDiagram grafo={p.grafo} altura={ativo.id === "visao-geral" ? 460 : 360} />
              {p.detalhes && p.detalhes.length > 0 && (
                <ul className="mt-3 space-y-1.5 max-w-3xl">
                  {p.detalhes.map((d, i) => (
                    <li key={i} className="flex gap-2 text-sm text-muted-foreground leading-relaxed">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {/* Legenda BPMN */}
          <div className="rounded-xl border border-border bg-muted/60 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Legenda (simbologia BPMN)
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-emerald-500" /> Início do processo
              </span>
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-[3px] border-rose-500" /> Fim do processo
              </span>
              <span className="flex items-center gap-2">
                <span className="h-4 w-6 rounded border-2 border-border bg-card" /> Tarefa / atividade
              </span>
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rotate-45 border-2 border-amber-400 bg-warning/10" /> Decisão (gateway)
              </span>
              <span className="flex items-center gap-2">
                <span className="h-4 w-5 rounded border border-dashed border-border bg-card" /> Anotação
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
