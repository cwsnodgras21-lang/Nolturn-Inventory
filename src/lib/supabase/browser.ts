import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

export function createBrowserSupabaseClient() {
  const env = getPublicEnv();
  return createBrowserClient<Database>(env.supabaseUrl, env.supabasePublishableKey);
}
