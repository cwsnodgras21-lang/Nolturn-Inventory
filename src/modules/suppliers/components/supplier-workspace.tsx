"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  createSupplierAction,
  deleteSupplierContactAction,
  updateSupplierAction,
  upsertSupplierContactAction,
} from "@/modules/suppliers/commands";
import type { Supplier, SupplierContact } from "@/modules/suppliers/types";

export function CreateSupplierForm({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <form
      className="grid max-w-xl gap-4 border border-border bg-surface p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || !canManage) return;
        setMessage(null);
        startTransition(async () => {
          const result = await createSupplierAction({
            name,
            email: email || null,
            phone: phone || null,
            accountNumber: accountNumber || null,
            notes: notes || null,
            status: "active",
          });
          if (!result.ok) {
            setMessage(result.error);
            return;
          }
          router.push(`/purchasing/suppliers/${result.data.id}`);
          router.refresh();
        });
      }}
    >
      <h2 className="text-lg font-semibold">New supplier</h2>
      <label className="space-y-1 text-sm">
        <span className="text-muted">Name</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted">Phone</span>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted">Account number</span>
        <input
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      {message ? <p className="text-sm text-accent">{message}</p> : null}
      <Button type="submit" disabled={pending || !canManage || !name.trim()}>
        {pending ? "Saving…" : "Create supplier"}
      </Button>
    </form>
  );
}

export function SupplierDetail({
  supplier,
  contacts,
  canManage,
}: {
  supplier: Supplier;
  contacts: SupplierContact[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState(supplier.name);
  const [email, setEmail] = useState(supplier.email ?? "");
  const [phone, setPhone] = useState(supplier.phone ?? "");
  const [website, setWebsite] = useState(supplier.website ?? "");
  const [accountNumber, setAccountNumber] = useState(supplier.accountNumber ?? "");
  const [notes, setNotes] = useState(supplier.notes ?? "");
  const [status, setStatus] = useState(supplier.status);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  return (
    <div className="grid gap-8">
      <form
        className="grid max-w-xl gap-4 border border-border bg-surface p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canManage || pending) return;
          setMessage(null);
          startTransition(async () => {
            const result = await updateSupplierAction(supplier.id, {
              name,
              email: email || null,
              phone: phone || null,
              website: website || null,
              accountNumber: accountNumber || null,
              notes: notes || null,
              status,
            });
            setMessage(result.ok ? "Saved." : result.error);
            if (result.ok) router.refresh();
          });
        }}
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{supplier.name}</h2>
          <p className="text-sm text-muted capitalize">Status: {supplier.status}</p>
        </div>
        <label className="space-y-1 text-sm">
          <span className="text-muted">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canManage}
            className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
            disabled={!canManage}
            className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!canManage}
            className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">Phone</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={!canManage}
            className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">Website</span>
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            disabled={!canManage}
            className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">Account number</span>
          <input
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            disabled={!canManage}
            className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canManage}
            rows={3}
            className="w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        {message ? <p className="text-sm text-accent">{message}</p> : null}
        {canManage ? (
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save supplier"}
          </Button>
        ) : null}
      </form>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold">Contacts</h3>
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-border bg-surface text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id} className="border-b border-border/70">
                  <td className="px-3 py-2">
                    {contact.name}
                    {contact.isPrimary ? (
                      <span className="ml-2 text-xs text-muted">Primary</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-muted">{contact.email || "—"}</td>
                  <td className="px-3 py-2 text-muted">{contact.phone || "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {canManage ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          startTransition(async () => {
                            await deleteSupplierContactAction(supplier.id, contact.id);
                            router.refresh();
                          });
                        }}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {contacts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted">
                    No contacts yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {canManage ? (
          <form
            className="grid max-w-xl gap-3 border border-border p-4"
            onSubmit={(event) => {
              event.preventDefault();
              startTransition(async () => {
                const result = await upsertSupplierContactAction(supplier.id, {
                  name: contactName,
                  email: contactEmail || null,
                  phone: contactPhone || null,
                  isPrimary: contacts.length === 0,
                });
                if (!result.ok) {
                  setMessage(result.error);
                  return;
                }
                setContactName("");
                setContactEmail("");
                setContactPhone("");
                router.refresh();
              });
            }}
          >
            <h4 className="font-medium">Add contact</h4>
            <input
              required
              placeholder="Name"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-3 text-base"
            />
            <input
              placeholder="Email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-3 text-base"
            />
            <input
              placeholder="Phone"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-3 text-base"
            />
            <Button type="submit" disabled={pending || !contactName.trim()}>
              Add contact
            </Button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
