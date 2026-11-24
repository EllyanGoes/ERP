"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useEmbutidoNaCompra } from "@/lib/compra-embutida";

interface Breadcrumb { label: string; href?: string }

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Breadcrumb[];
  action?: ReactNode;
  actions?: ReactNode;
}

export default function PageHeader({ title, subtitle, breadcrumbs, action, actions }: PageHeaderProps) {
  // Dentro de uma aba da página da compra o título é o da compra: fica só a barra de botões.
  const embutido = useEmbutidoNaCompra();
  if (embutido) {
    const botoes = action ?? actions;
    return botoes ? <div className="flex justify-end px-8 pt-4 pb-2">{botoes}</div> : null;
  }
  return (
    <div className="flex items-start justify-between px-8 pt-8 pb-6">
      <div>
        {breadcrumbs && (
          <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
            {breadcrumbs.map((bc, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-3 h-3" />}
                {bc.href ? (
                  <Link href={bc.href} className="hover:text-foreground transition-colors">
                    {bc.label}
                  </Link>
                ) : (
                  <span className="text-foreground/80">{bc.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {(action ?? actions) && <div>{action ?? actions}</div>}
    </div>
  );
}
