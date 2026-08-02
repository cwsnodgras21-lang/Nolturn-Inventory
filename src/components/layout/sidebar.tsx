"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  ClipboardList,
  LayoutDashboard,
  Settings2,
  Sparkles,
} from "lucide-react";
import { platformNav, type NavItem } from "@/config/app";
import { BrandMark, PhaseBadge } from "@/components/layout/brand";
import { cn } from "@/lib/utils";

const icons = {
  "/dashboard": LayoutDashboard,
  "/inventory": Boxes,
  "/purchasing": ClipboardList,
  "/nolt": Sparkles,
  "/administration": Settings2,
} as const;

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = icons[item.href as keyof typeof icons] ?? LayoutDashboard;

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-accent-muted text-foreground"
          : "text-muted hover:bg-surface-raised hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">{item.label}</span>
        <span className="truncate text-xs text-muted">{item.description}</span>
      </span>
      {item.status === "planned" ? (
        <span className="text-[10px] uppercase tracking-wide text-warning">Soon</span>
      ) : null}
    </Link>
  );
}

export function Sidebar({
  permissionKeys,
  organizationName,
}: {
  permissionKeys: string[];
  organizationName: string;
}) {
  const visible = platformNav.filter((item) => {
    if (!item.anyOfPermissions?.length) return true;
    return item.anyOfPermissions.some((key) => permissionKeys.includes(key));
  });

  return (
    <aside className="flex w-full flex-col border-b border-border bg-surface md:h-full md:w-64 md:border-b-0 md:border-r">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4">
        <BrandMark compact />
      </div>
      <div className="space-y-2 px-4 py-3">
        <PhaseBadge />
        <p className="truncate text-xs text-muted" title={organizationName}>
          {organizationName}
        </p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-2 pb-4" aria-label="Primary">
        {visible.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>
    </aside>
  );
}
