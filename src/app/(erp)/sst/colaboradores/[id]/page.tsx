"use client";

import { useParams } from "next/navigation";
import FichaSstColaborador from "@/components/sst/FichaSstColaborador";

export default function SstFichaPage() {
  const { id } = useParams<{ id: string }>();
  return <FichaSstColaborador id={id} />;
}
