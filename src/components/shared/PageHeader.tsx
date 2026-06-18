import { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface Breadcrumb { label: string; href?: string }

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Breadcrumb[];
  action?: ReactNode;
  actions?: ReactNode;
}

export default function PageHeader({ title, subtitle, breadcrumbs, action, actions }: PageHeaderProps) {
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
