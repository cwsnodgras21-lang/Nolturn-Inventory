import { PlatformShell } from "@/components/layout/platform-shell";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { can } from "@/lib/permissions";
import { countOpenAlerts } from "@/modules/alerts/queries";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { user, tenant } = await resolvePlatformContext();

  let openAlertCount = 0;
  if (can(tenant, "alerts.read")) {
    try {
      openAlertCount = await countOpenAlerts();
    } catch {
      openAlertCount = 0;
    }
  }

  return (
    <PlatformShell
      permissionKeys={tenant.permissionKeys}
      organizationName={tenant.organizationName}
      userEmail={user.email}
      openAlertCount={openAlertCount}
    >
      {children}
    </PlatformShell>
  );
}
