import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Service-role client for trusted server workflows only
 * (local bootstrap, future verified webhooks). Never import from Client Components.
 */
export function createServiceRoleClient() {
  const env = getServerEnv();
  return createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
