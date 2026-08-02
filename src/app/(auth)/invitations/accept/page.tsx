import type { Metadata } from "next";
import Link from "next/link";
import { AcceptInvitationClient } from "@/modules/onboarding/components/accept-invitation-client";

export const metadata: Metadata = {
  title: "Accept invitation",
};

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = params.token?.trim() ?? "";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Nolt Inventory</p>
        <h1 className="text-3xl font-semibold tracking-tight">Accept invitation</h1>
        <p className="text-muted">
          Sign in with the invited email address, then accept to join the organization.
        </p>
      </div>
      {!token ? (
        <p className="text-sm text-danger" role="alert">
          Missing invitation token. Open the full accept link from your invite.
        </p>
      ) : (
        <AcceptInvitationClient token={token} />
      )}
      <p className="text-sm text-muted">
        Need an account first? <Link href="/login">Sign in or create one</Link>, then return to this
        link.
      </p>
    </main>
  );
}
