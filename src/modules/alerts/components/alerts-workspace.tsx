"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  acknowledgeAlertAction,
  resolveAlertAction,
  syncOperationalAlertsAction,
} from "@/modules/alerts/commands";
import { alertTypeLabel } from "@/modules/alerts/mappers";
import type { OperationalAlert } from "@/modules/alerts/types";
import {
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  ALERT_TYPES,
} from "@/modules/alerts/types";

export function AlertsFilterBar({
  alertType,
  severity,
  status,
  locationId,
  locations,
}: {
  alertType: string;
  severity: string;
  status: string;
  locationId: string;
  locations: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  return (
    <form
      className="flex flex-wrap gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const params = new URLSearchParams();
        for (const key of ["type", "severity", "status", "location"] as const) {
          const value = String(data.get(key) || "all");
          if (value !== "all") params.set(key, value);
        }
        router.push(`/alerts${params.size ? `?${params}` : ""}`);
      }}
    >
      <label className="space-y-1 text-sm">
        <span className="text-muted">Type</span>
        <select
          name="type"
          defaultValue={alertType}
          className="block min-w-[10rem] rounded-md border border-border bg-background px-3 py-2"
        >
          <option value="all">All types</option>
          {ALERT_TYPES.map((value) => (
            <option key={value} value={value}>
              {alertTypeLabel(value)}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted">Severity</span>
        <select
          name="severity"
          defaultValue={severity}
          className="block min-w-[8rem] rounded-md border border-border bg-background px-3 py-2"
        >
          <option value="all">All</option>
          {ALERT_SEVERITIES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted">Status</span>
        <select
          name="status"
          defaultValue={status}
          className="block min-w-[8rem] rounded-md border border-border bg-background px-3 py-2"
        >
          <option value="all">Open + acknowledged</option>
          {ALERT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
          <option value="history">All including resolved</option>
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted">Location</span>
        <select
          name="location"
          defaultValue={locationId}
          className="block min-w-[10rem] rounded-md border border-border bg-background px-3 py-2"
        >
          <option value="all">All locations</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-end">
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </div>
    </form>
  );
}

export function AlertsToolbar({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (!canManage) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await syncOperationalAlertsAction();
            if (!result.ok) {
              setMessage(result.error);
              return;
            }
            setMessage(
              `Synced: ${result.data.created} new, ${result.data.updated} refreshed, ${result.data.resolved} resolved.`,
            );
            router.refresh();
          });
        }}
      >
        Refresh alerts
      </Button>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </div>
  );
}

export function AlertsTable({
  alerts,
  canManage,
}: {
  alerts: OperationalAlert[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function acknowledge(id: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await acknowledgeAlertAction(id);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      router.refresh();
    });
  }

  function resolve(id: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await resolveAlertAction(id);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-border bg-surface text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Alert</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Severity</th>
              <th className="px-3 py-2 font-medium">Location</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Detected</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => (
              <tr key={alert.id} className="border-b border-border/70 align-top">
                <td className="px-3 py-3">
                  <div className="font-medium">{alert.title}</div>
                  <p className="mt-1 max-w-md text-xs text-muted">{alert.description}</p>
                  {alert.relatedHref ? (
                    <Link
                      href={alert.relatedHref}
                      className="mt-2 inline-block text-xs text-accent underline-offset-2 hover:underline"
                    >
                      Open related record
                    </Link>
                  ) : null}
                </td>
                <td className="px-3 py-3">{alertTypeLabel(alert.alertType)}</td>
                <td className="px-3 py-3 capitalize">{alert.severity}</td>
                <td className="px-3 py-3">{alert.locationName ?? "—"}</td>
                <td className="px-3 py-3 capitalize">{alert.status}</td>
                <td className="px-3 py-3 text-muted">
                  {new Date(alert.detectedAt).toLocaleString()}
                </td>
                <td className="px-3 py-3 text-right">
                  {canManage && alert.status === "open" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => acknowledge(alert.id)}
                    >
                      Acknowledge
                    </Button>
                  ) : null}
                  {canManage && alert.status !== "resolved" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => resolve(alert.id)}
                    >
                      Resolve
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
            {alerts.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted">
                  No alerts match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
