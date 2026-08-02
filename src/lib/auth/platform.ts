import "server-only";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/env";
import { getOptionalUser, requireTenantContext } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { listUserMemberships } from "@/modules/organizations";
import type { TenantContext } from "@/lib/auth/types";
import type { AuthenticatedUser } from "@/lib/auth/types";

export async function requireAuthenticatedPage(): Promise<AuthenticatedUser> {
  const user = await getOptionalUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function resolvePlatformContext(): Promise<{
  user: AuthenticatedUser;
  memberships: Awaited<ReturnType<typeof listUserMemberships>>;
  tenant: TenantContext;
}> {
  const user = await requireAuthenticatedPage();
  const memberships = await listUserMemberships();

  if (memberships.length === 0) {
    redirect("/organizations");
  }

  const cookieStore = await cookies();
  const activeId = cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value;

  if (!activeId) {
    if (memberships.length === 1) {
      redirect(`/organizations?auto=${memberships[0]!.organizationId}`);
    }
    redirect("/organizations");
  }

  try {
    const tenant = await requireTenantContext(activeId);
    return { user, memberships, tenant };
  } catch (error) {
    if (error instanceof AppError && error.code === "MEMBERSHIP_REQUIRED") {
      redirect("/organizations");
    }
    throw error;
  }
}
