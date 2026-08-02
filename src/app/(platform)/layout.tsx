import { PlatformShell } from "@/components/layout/platform-shell";
import { resolvePlatformContext } from "@/lib/auth/platform";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { user, tenant } = await resolvePlatformContext();

  return (
    <PlatformShell
      permissionKeys={tenant.permissionKeys}
      organizationName={tenant.organizationName}
      userEmail={user.email}
    >
      {children}
    </PlatformShell>
  );
}
