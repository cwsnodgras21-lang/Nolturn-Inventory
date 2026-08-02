"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  signInWithPasswordAction,
  signUpWithPasswordAction,
} from "@/modules/identity/actions";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result =
        mode === "signin"
          ? await signInWithPasswordAction({ email, password })
          : await signUpWithPasswordAction({ email, password, displayName });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    });
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      {mode === "signup" ? (
        <label className="block space-y-1.5 text-sm">
          <span className="text-muted">Display name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
            autoComplete="name"
          />
        </label>
      ) : null}

      <label className="block space-y-1.5 text-sm">
        <span className="text-muted">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
          autoComplete="email"
        />
      </label>

      <label className="block space-y-1.5 text-sm">
        <span className="text-muted">Password</span>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
        />
      </label>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
      </Button>

      <button
        type="button"
        className="w-full text-sm text-muted hover:text-foreground"
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError(null);
        }}
      >
        {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
      </button>
    </form>
  );
}
