"use client";

// Página de impressão da cautela de EPI (o conteúdo vive em CautelaEpi).
import { useParams } from "next/navigation";
import { useTabTitle } from "@/lib/tabs-context";
import CautelaEpi from "@/components/sst/CautelaEpi";

export default function CautelaEpiImprimir() {
  const { id } = useParams<{ id: string }>();
  useTabTitle("Cautela de EPI");
  return <CautelaEpi id={id} />;
}
