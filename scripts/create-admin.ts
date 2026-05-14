import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@erp.com";
  const existing = await prisma.usuario.findUnique({ where: { email } });
  if (existing) {
    console.log("Admin já existe:", email);
    return;
  }
  const senha = await bcrypt.hash("admin123", 12);
  await prisma.usuario.create({
    data: { nome: "Administrador", email, senha, perfil: "ADMIN", ativo: true },
  });
  console.log("Admin criado! Email:", email, "Senha: admin123");
}

main().then(() => prisma.$disconnect()).catch(console.error);
