"use server";

import { redirect } from "next/navigation";
import { AppError, toSafeErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { z } from "zod";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export type AuthActionResult = { ok: true } | { ok: false; error: string };

export async function signInWithPasswordAction(
  raw: unknown,
): Promise<AuthActionResult> {
  try {
    const input = credentialsSchema.parse(raw);
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

    if (error) {
      throw new AppError("UNAUTHENTICATED", "Invalid email or password.", 401);
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: toSafeErrorMessage(error) };
  }
}

export async function signOutAction(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function signUpWithPasswordAction(
  raw: unknown,
): Promise<AuthActionResult> {
  try {
    const input = credentialsSchema
      .extend({
        displayName: z.string().trim().min(1).max(80).optional(),
      })
      .parse(raw);

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          display_name: input.displayName,
        },
      },
    });

    if (error) {
      throw new AppError("VALIDATION", error.message, 400);
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: toSafeErrorMessage(error) };
  }
}
