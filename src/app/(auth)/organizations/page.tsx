import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandMark } from "@/components/layout/brand";
import { OrganizationPicker } from "@/components/organizations/organization-picker";
import { requireAuthenticatedPage } from "@/lib/auth/platform";
import { listUserMemberships } from "@/modules/organizations";

export const metadata: Metadata = {
  title: "Organizations",
};

export default async function OrganizationsPage() {
  await requireAuthenticatedPage();
  const memberships = await listUserMemberships();

  return (
    <div className="min-h-full px-4 py-12 sm:px-8">
      <div className="mx-auto mb-10 max-w-lg">
        <BrandMark />
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Organizations</h1>
        <p className="mt-2 text-sm text-muted">
          Choose an active organization. The selection cookie is only a hint — membership is
          revalidated on every server request.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <OrganizationPicker memberships={memberships} />
      </Suspense>
    </div>
  );
}
