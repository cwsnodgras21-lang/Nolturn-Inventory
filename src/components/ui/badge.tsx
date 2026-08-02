import { cn } from "@/lib/utils";

type BadgeProps = {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "warning";
  className?: string;
};

const tones = {
  neutral: "bg-surface-raised text-muted border-border",
  accent: "bg-accent-muted text-accent border-accent/30",
  warning: "bg-warning/15 text-warning border-warning/30",
} as const;

export function Badge({ children, tone = "neutral", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
