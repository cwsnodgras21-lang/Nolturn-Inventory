import type { Metadata } from "next";
import { PlannedFeature } from "@/components/shared/planned-feature";

export const metadata: Metadata = {
  title: "Purchasing",
};

export default function PurchasingPage() {
  return (
    <PlannedFeature
      title="Purchasing"
      phase="Phase 4"
      summary="Purchase requests, purchase orders, receiving, and suppliers land in Phase 4. Full accounts payable is intentionally out of scope."
      highlights={[
        "Draft → approve → convert → receive",
        "Partial receipts and backorders supported by design",
        "Accounting systems integrate through adapters later",
      ]}
    />
  );
}
