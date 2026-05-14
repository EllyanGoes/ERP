export type ModuloDef = {
  key: string;
  label: string;
  group: string;
};

export const MODULOS: ModuloDef[] = [
  { key: "dashboard",    label: "Dashboard",     group: "Geral" },
  { key: "comercial",    label: "Comercial",      group: "Comercial" },
  { key: "almoxarifado", label: "Almoxarifado",   group: "Suprimentos" },
  { key: "compras",      label: "Compras",        group: "Suprimentos" },
  { key: "financeiro",   label: "Financeiro",     group: "Financeiro" },
  { key: "admin",        label: "Administração",  group: "Sistema" },
];

export const MODULO_GROUPS = Array.from(new Set(MODULOS.map((m) => m.group)));
