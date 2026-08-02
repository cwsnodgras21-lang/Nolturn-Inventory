import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("Nolt Inventory"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
});

export type PublicEnv = {
  appUrl: string;
  appName: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
};

function resolvePublishableKey(env: {
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
}): string {
  const key =
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!key) {
    throw new Error(
      "Missing Supabase publishable key. Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (preferred) or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  return key;
}

/** Central public env resolution. Do not read NEXT_PUBLIC_* ad hoc elsewhere. */
export function getPublicEnv(): PublicEnv {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!parsed.success) {
    throw new Error(`Invalid public environment: ${parsed.error.message}`);
  }

  return {
    appUrl: parsed.data.NEXT_PUBLIC_APP_URL,
    appName: parsed.data.NEXT_PUBLIC_APP_NAME,
    supabaseUrl: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: resolvePublishableKey(parsed.data),
  };
}

/** Server-only secrets. Never import from Client Components. */
export function getServerEnv() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (server-only).");
  }

  return {
    ...getPublicEnv(),
    supabaseServiceRoleKey: serviceRoleKey,
  };
}

export const ACTIVE_ORGANIZATION_COOKIE = "nolt_active_organization_id";
