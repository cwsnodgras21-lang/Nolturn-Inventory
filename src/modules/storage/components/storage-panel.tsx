"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  changeStorageAreaStatusAction,
  changeStorageBinStatusAction,
  createStorageAreaAction,
  createStorageBinAction,
  reparentStorageAreaAction,
  updateStorageAreaAction,
} from "@/modules/storage/commands";
import {
  STORAGE_AREA_TYPES,
  type StorageArea,
  type StorageAreaTreeNode,
  type StorageBin,
} from "@/modules/storage/types";

type LocationOption = { id: string; name: string; code: string | null };

function AreaNode({
  node,
  depth,
  canManage,
  allAreas,
  binsByArea,
  pending,
  onMessage,
  onRefresh,
}: {
  node: StorageAreaTreeNode;
  depth: number;
  canManage: boolean;
  allAreas: StorageArea[];
  binsByArea: Map<string, StorageBin[]>;
  pending: boolean;
  onMessage: (message: string | null) => void;
  onRefresh: () => void;
}) {
  const bins = binsByArea.get(node.id) ?? [];
  const [editing, setEditing] = useState(false);
  const [binName, setBinName] = useState("");
  const [binCode, setBinCode] = useState("");

  return (
    <li className="space-y-3 border-b border-border/70 py-4 last:border-b-0">
      <div style={{ paddingLeft: depth * 16 }} className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium">
              {node.name}
              {node.code ? (
                <span className="ml-2 font-mono text-xs text-muted">{node.code}</span>
              ) : null}
            </p>
            <p className="text-xs text-muted">
              <span className="capitalize">{node.areaType}</span>
              {" · "}
              <span className="capitalize">{node.status}</span>
            </p>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => setEditing((value) => !value)}
              >
                {editing ? "Close" : "Edit"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  onMessage(null);
                  const next = node.status === "active" ? "inactive" : "active";
                  void changeStorageAreaStatusAction(node.id, { status: next }).then((result) => {
                    if (!result.ok) {
                      onMessage(result.error);
                      return;
                    }
                    onRefresh();
                  });
                }}
              >
                {node.status === "active" ? "Deactivate" : "Activate"}
              </Button>
            </div>
          ) : null}
        </div>

        {editing && canManage ? (
          <form
            className="grid gap-3 border border-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              onMessage(null);
              void updateStorageAreaAction(node.id, {
                name: String(form.get("name") ?? node.name),
                code: String(form.get("code") ?? "") || null,
                areaType: String(form.get("areaType") ?? node.areaType) as StorageArea["areaType"],
                sortOrder: Number(form.get("sortOrder") ?? node.sortOrder),
              }).then(async (result) => {
                if (!result.ok) {
                  onMessage(result.error);
                  return;
                }
                const parentIdRaw = String(form.get("parentId") ?? "");
                const nextParent = parentIdRaw === "" ? null : parentIdRaw;
                if (nextParent !== node.parentId) {
                  const reparent = await reparentStorageAreaAction(node.id, {
                    parentId: nextParent,
                  });
                  if (!reparent.ok) {
                    onMessage(reparent.error);
                    return;
                  }
                }
                setEditing(false);
                onMessage("Storage area updated.");
                onRefresh();
              });
            }}
          >
            <input
              name="name"
              defaultValue={node.name}
              required
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              name="code"
              defaultValue={node.code ?? ""}
              placeholder="Code"
              className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
            />
            <select
              name="areaType"
              defaultValue={node.areaType}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {STORAGE_AREA_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <input
              name="sortOrder"
              type="number"
              defaultValue={node.sortOrder}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <select
              name="parentId"
              defaultValue={node.parentId ?? ""}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm sm:col-span-2"
            >
              <option value="">No parent (root)</option>
              {allAreas
                .filter((area) => area.id !== node.id)
                .map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
            </select>
            <Button type="submit" disabled={pending} className="sm:col-span-2">
              Save area
            </Button>
          </form>
        ) : null}

        <div className="space-y-2 border-l border-border pl-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Bins</p>
          {bins.length === 0 ? (
            <p className="text-xs text-muted">No bins (optional).</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {bins.map((bin) => (
                <li key={bin.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {bin.name}
                    {bin.code ? (
                      <span className="ml-2 font-mono text-xs text-muted">{bin.code}</span>
                    ) : null}
                    <span className="ml-2 capitalize text-muted">{bin.status}</span>
                  </span>
                  {canManage ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        onMessage(null);
                        const next = bin.status === "active" ? "inactive" : "active";
                        void changeStorageBinStatusAction(bin.id, { status: next }).then(
                          (result) => {
                            if (!result.ok) {
                              onMessage(result.error);
                              return;
                            }
                            onRefresh();
                          },
                        );
                      }}
                    >
                      {bin.status === "active" ? "Deactivate" : "Activate"}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canManage ? (
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                onMessage(null);
                void createStorageBinAction({
                  storageAreaId: node.id,
                  name: binName,
                  code: binCode.trim() ? binCode : null,
                }).then((result) => {
                  if (!result.ok) {
                    onMessage(result.error);
                    return;
                  }
                  setBinName("");
                  setBinCode("");
                  onMessage("Bin created.");
                  onRefresh();
                });
              }}
            >
              <input
                required
                value={binName}
                onChange={(e) => setBinName(e.target.value)}
                placeholder="Bin name"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                value={binCode}
                onChange={(e) => setBinCode(e.target.value)}
                placeholder="Code"
                className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
              />
              <Button type="submit" variant="secondary" disabled={pending}>
                Add bin
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      {node.children.length > 0 ? (
        <ul>
          {node.children.map((child) => (
            <AreaNode
              key={child.id}
              node={child}
              depth={depth + 1}
              canManage={canManage}
              allAreas={allAreas}
              binsByArea={binsByArea}
              pending={pending}
              onMessage={onMessage}
              onRefresh={onRefresh}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function StoragePanel({
  locations,
  selectedLocationId,
  tree,
  areas,
  bins,
  canManage,
}: {
  locations: LocationOption[];
  selectedLocationId: string;
  tree: StorageAreaTreeNode[];
  areas: StorageArea[];
  bins: StorageBin[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [areaType, setAreaType] = useState<(typeof STORAGE_AREA_TYPES)[number]>("room");
  const [parentId, setParentId] = useState("");

  const binsByArea = useMemo(() => {
    const map = new Map<string, StorageBin[]>();
    for (const bin of bins) {
      const list = map.get(bin.storageAreaId) ?? [];
      list.push(bin);
      map.set(bin.storageAreaId, list);
    }
    return map;
  }, [bins]);

  const filteredTree = useMemo(() => {
    const matches = (area: StorageArea) => {
      if (statusFilter !== "all" && area.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const term = search.trim().toLowerCase();
      return (
        area.name.toLowerCase().includes(term) ||
        (area.code?.toLowerCase().includes(term) ?? false)
      );
    };

    function filterNodes(nodes: StorageAreaTreeNode[]): StorageAreaTreeNode[] {
      const result: StorageAreaTreeNode[] = [];
      for (const node of nodes) {
        const children = filterNodes(node.children);
        if (matches(node) || children.length > 0) {
          result.push({ ...node, children });
        }
      }
      return result;
    }

    return filterNodes(tree);
  }, [tree, search, statusFilter]);

  function refresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-3">
        <label className="space-y-1 text-sm">
          <span className="text-muted">Location</span>
          <select
            value={selectedLocationId}
            onChange={(e) => {
              router.push(`/administration/storage?locationId=${e.target.value}`);
            }}
            className="block min-w-[220px] rounded-md border border-border bg-background px-3 py-2"
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
                {location.code ? ` (${location.code})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">Search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or code"
            className="block rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="block rounded-md border border-border bg-background px-3 py-2"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      </div>

      {message ? <p className="text-sm text-accent">{message}</p> : null}

      {canManage ? (
        <form
          className="grid gap-3 border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault();
            setMessage(null);
            startTransition(async () => {
              const result = await createStorageAreaAction({
                locationId: selectedLocationId,
                parentId: parentId || null,
                name,
                code: code.trim() ? code : null,
                areaType,
              });
              if (!result.ok) {
                setMessage(result.error);
                return;
              }
              setName("");
              setCode("");
              setParentId("");
              setMessage("Storage area created.");
              router.refresh();
            });
          }}
        >
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Area name"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm lg:col-span-2"
          />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Code (optional)"
            className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
          />
          <select
            value={areaType}
            onChange={(e) => setAreaType(e.target.value as typeof areaType)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {STORAGE_AREA_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm lg:col-span-2"
          >
            <option value="">Root area</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                Child of {area.name}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={pending}>
            Add area
          </Button>
        </form>
      ) : null}

      <ul className="border border-border">
        {filteredTree.map((node) => (
          <AreaNode
            key={node.id}
            node={node}
            depth={0}
            canManage={canManage}
            allAreas={areas}
            binsByArea={binsByArea}
            pending={pending}
            onMessage={setMessage}
            onRefresh={refresh}
          />
        ))}
        {filteredTree.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-muted">
            No storage areas for this location.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
