import type { Metadata } from "next";
import { BrandMark, PhaseBadge } from "@/components/layout/brand";
import { LoginForm } from "@/components/auth/login-form";
import { getOptionalUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage() {
  const user = await getOptionalUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-8 border border-border bg-surface p-8">
        <div className="space-y-4">
          <BrandMark />
          <PhaseBadge />
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm leading-relaxed text-muted">
            Email and password authentication via Supabase Auth. Sessions are validated on the
            server for every protected request.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
