import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";

export function PlatformShell({
  children,
  permissionKeys,
  organizationName,
  userEmail,
  openAlertCount = 0,
}: {
  children: React.ReactNode;
  permissionKeys: string[];
  organizationName: string;
  userEmail: string | null;
  openAlertCount?: number;
}) {
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <Sidebar
        permissionKeys={permissionKeys}
        organizationName={organizationName}
        openAlertCount={openAlertCount}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar userEmail={userEmail} organizationName={organizationName} />
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
