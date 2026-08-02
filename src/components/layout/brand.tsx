import Link from "next/link";
import { appConfig } from "@/config/app";
import { Badge } from "@/components/ui/badge";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-3">
      <span
        aria-hidden
        className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-sm font-bold text-background"
      >
        N
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-semibold tracking-tight text-foreground group-hover:text-accent">
          {appConfig.name}
        </span>
        {!compact ? (
          <span className="text-xs text-muted">{appConfig.company}</span>
        ) : null}
      </span>
    </Link>
  );
}

export function PhaseBadge() {
  return <Badge tone="accent">{appConfig.phaseLabel}</Badge>;
}
