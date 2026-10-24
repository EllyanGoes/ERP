// Endereço ANTIGO da etiqueta QR (/pcm/a/<codApl>) — as etiquetas já impressas
// continuam funcionando: redireciona para a página pública do ativo
// (/ativo/<qrToken>). Como está dentro do (erp), exige login (o middleware manda
// ao /login e volta para cá) — de propósito: o codApl é sequencial e não pode
// virar porta de entrada pública. Reimprima as etiquetas para o QR novo.
import { redirect, notFound } from "next/navigation";
import { prismaSemEscopo } from "@/lib/prisma";
import { novoQrToken } from "@/lib/manutencao/publico";

export const dynamic = "force-dynamic";

export default async function AtivoQrLegadoPage({ params }: { params: { codApl: string } }) {
  const codApl = Number(params.codApl);
  if (!Number.isInteger(codApl) || codApl <= 0) notFound();
  // codApl é único no grupo todo — a etiqueta vale qualquer que seja a empresa ativa.
  const a = await prismaSemEscopo.manutAtivo.findUnique({ where: { codApl }, select: { id: true, qrToken: true } });
  if (!a) notFound();
  let token = a.qrToken;
  if (!token) {
    token = novoQrToken();
    await prismaSemEscopo.manutAtivo.update({ where: { id: a.id }, data: { qrToken: token } });
  }
  redirect(`/ativo/${token}`);
}
