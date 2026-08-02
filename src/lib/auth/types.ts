export type LocationAccessMode = "all" | "restricted";

export type TenantContext = {
  userId: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  membershipId: string;
  membershipStatus: "active";
  permissionKeys: string[];
  roleKeys: string[];
  locationAccessMode: LocationAccessMode;
  allowedLocationIds: string[];
};

export type AuthenticatedUser = {
  id: string;
  email: string | null;
};
