import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type PlannedFeatureProps = {
  title: string;
  summary: string;
  phase: string;
  highlights?: string[];
};

export function PlannedFeature({ title, summary, phase, highlights = [] }: PlannedFeatureProps) {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warning">Planned</Badge>
        <Badge>{phase}</Badge>
      </div>

      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h1>
        <p className="max-w-2xl text-base leading-relaxed text-muted">{summary}</p>
      </div>

      {highlights.length > 0 ? (
        <ul className="space-y-2 border-l border-border pl-4 text-sm text-muted">
          {highlights.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-3 pt-2">
        <Button href="/dashboard" variant="secondary">
          Back to dashboard
        </Button>
      </div>

      <p className="text-xs text-muted">
        This capability is intentionally unavailable in Version 1.0. No mock data is shown here.
      </p>
    </section>
  );
}
