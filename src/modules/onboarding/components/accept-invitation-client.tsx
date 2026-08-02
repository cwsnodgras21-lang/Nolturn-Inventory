"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { acceptInvitationAction } from "@/modules/onboarding/commands";
import { switchOrganizationAction } from "@/modules/organizations/actions";

export function AcceptInvitationClient({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4 border border-border bg-surface p-5">
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await acceptInvitationAction(token);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            await switchOrganizationAction(result.data.organizationId);
            router.replace("/dashboard");
            router.refresh();
          });
        }}
      >
        Accept invitation
      </Button>
    </div>
  );
}
