export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const empresa = await prisma.empresa.findFirst();
  return NextResponse.json({ data: empresa ?? null });
}
