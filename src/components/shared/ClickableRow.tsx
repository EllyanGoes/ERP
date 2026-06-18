"use client";
import { useRouter } from "next/navigation";

interface ClickableRowProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

export default function ClickableRow({ href, children, className = "" }: ClickableRowProps) {
  const router = useRouter();
  return (
    <tr
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
        router.push(href);
      }}
      className={`cursor-pointer transition-colors hover:bg-info/10 ${className}`}
    >
      {children}
    </tr>
  );
}
