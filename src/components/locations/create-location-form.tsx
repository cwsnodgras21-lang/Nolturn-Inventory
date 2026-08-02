"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createLocationAction } from "@/modules/locations/actions";

export function CreateLocationForm() {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await createLocationAction({
        name,
        code: code || undefined,
        countryCode: "US",
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setName("");
      setCode("");
      setMessage("Location created.");
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-sm">
        <span className="text-muted">Name</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="block rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted">Code</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="block rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Add location"}
      </Button>
      {message ? <p className="w-full text-sm text-muted">{message}</p> : null}
    </form>
  );
}
