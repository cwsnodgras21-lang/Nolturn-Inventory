import { redirect } from "next/navigation";

/** Legacy Phase 2.4 route — adjustments now start at /inventory/adjust. */
export default function NewAdjustmentRedirectPage() {
  redirect("/inventory/adjust");
}
