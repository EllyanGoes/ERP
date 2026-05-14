import { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface Breadcrumb { label: string; href?: string }

interface PageHeaderProps {
  title: string;
  breadcrumbs?: Breadcrumb[];
  action?: ReactNode;
}

export default function PageHeader({ title, breadcrumbs, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between px-8 pt-8 pb-6">
      <div>
        {breadcrumbs && (
          <nav className="flex items-center gap-1 text-sm text-gray-400 mb-1">
            {breadcrumbs.map((bc, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-3 h-3" />}
                {bc.href ? (
                  <Link href={bc.href} className="hover:text-gray-600 transition-colors">
                    {bc.label}
                  </Link>
                ) : (
                  <span className="text-gray-600">{bc.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
