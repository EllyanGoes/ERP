"use client";

// Mapa da planta em tela cheia (a mesma componente do topo do Painel).
import PageHeader from "@/components/shared/PageHeader";
import { useTabTitle } from "@/lib/tabs-context";
import MapaPlanta from "@/components/manutencao/MapaPlanta";

export default function MapaPlantaPage() {
  useTabTitle("Mapa da planta");
  return (
    <div>
      <PageHeader title="Mapa da planta" subtitle="Áreas e equipamentos com o status de agora — clique na área para aprofundar, no equipamento para abrir" breadcrumbs={[{ label: "Manutenção", href: "/pcm" }, { label: "Mapa da planta" }]} />
      <div className="px-8 pb-10">
        <MapaPlanta telaCheia />
      </div>
    </div>
  );
}
