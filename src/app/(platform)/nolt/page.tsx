import type { Metadata } from "next";
import { PlannedFeature } from "@/components/shared/planned-feature";

export const metadata: Metadata = {
  title: "Nolt",
};

export default function NoltPage() {
  return (
    <PlannedFeature
      title="Nolt"
      phase="Phase 7"
      summary="Nolt is the centralized intelligence layer for reorder risk, expiration risk, summaries, and data quality recommendations. It is not implemented in Phase 0 and remains read-only by design."
      highlights={[
        "Capability registry under src/modules/nolt",
        "Same tenant authorization as the rest of the app",
        "No autonomous inventory changes without approval workflows",
      ]}
    />
  );
}
