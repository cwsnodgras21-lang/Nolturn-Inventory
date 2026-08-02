"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { platformNav } from "@/config/app";
import { signOutAction } from "@/modules/identity/actions";

export function TopBar({
  userEmail,
  organizationName,
}: {
  userEmail: string | null;
  organizationName: string;
}) {
  const pathname = usePathname();
  const current = platformNav.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  const title = current?.label ?? "Platform";

  return (
    <header className="flex items-center justify-between gap-4 border-b border-border bg-surface/80 px-4 py-3 backdrop-blur sm:px-6">
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-muted">{organizationName}</p>
        <p className="text-lg font-semibold tracking-tight text-foreground">{title}</p>
      </div>
      <div className="flex items-center gap-2">
        <Link href="/organizations" className="hidden text-sm text-muted hover:text-foreground sm:inline">
          Switch org
        </Link>
        <span className="hidden text-sm text-muted md:inline">{userEmail}</span>
        <form action={signOutAction}>
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
