"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  changeCategoryStatusAction,
  createCategoryAction,
  reparentCategoryAction,
  updateCategoryAction,
} from "@/modules/catalog/commands";
import type { CategoryTreeNode, ItemCategory } from "@/modules/catalog/types";

function flattenOptions(
  nodes: CategoryTreeNode[],
  depth = 0,
  excludeIds: Set<string> = new Set(),
): Array<{ id: string; label: string }> {
  const options: Array<{ id: string; label: string }> = [];
  for (const node of nodes) {
    if (!excludeIds.has(node.id)) {
      options.push({
        id: node.id,
        label: `${"— ".repeat(depth)}${node.name}`.trim(),
      });
      options.push(...flattenOptions(node.children, depth + 1, excludeIds));
    }
  }
  return options;
}

function collectDescendantIds(node: CategoryTreeNode): string[] {
  return [node.id, ...node.children.flatMap(collectDescendantIds)];
}

function CategoryNode({
  node,
  depth,
  canManage,
  tree,
  onMessage,
}: {
  node: CategoryTreeNode;
  depth: number;
  canManage: boolean;
  tree: CategoryTreeNode[];
  onMessage: (message: string | null) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [parentId, setParentId] = useState<string>(node.parentId ?? "");
  const excluded = new Set(collectDescendantIds(node));
  const parentOptions = flattenOptions(tree, 0, excluded);

  return (
    <li className="border-b border-border bg-surface px-4 py-3 last:border-b-0">
      <div style={{ paddingLeft: depth * 16 }} className="space-y-2">
        {canManage ? (
          <form
            className="grid gap-2 sm:grid-cols-4 sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              onMessage(null);
              startTransition(async () => {
                const result = await updateCategoryAction(node.id, {
                  name: String(formData.get("name") ?? node.name),
                  description: String(formData.get("description") ?? "") || null,
                });
                if (!result.ok) {
                  onMessage(result.error);
                  return;
                }
                onMessage("Category updated.");
                router.refresh();
              });
            }}
          >
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-muted">Name</span>
              <input
                name="name"
                defaultValue={node.name}
                className="block w-full rounded-md border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-muted">Description</span>
              <input
                name="description"
                defaultValue={node.description ?? ""}
                className="block w-full rounded-md border border-border bg-background px-3 py-2"
              />
            </label>
            <div className="flex flex-wrap gap-2 sm:col-span-4">
              <Button type="submit" variant="secondary" disabled={pending}>
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  onMessage(null);
                  startTransition(async () => {
                    const next = node.status === "active" ? "inactive" : "active";
                    const result = await changeCategoryStatusAction(node.id, { status: next });
                    if (!result.ok) {
                      onMessage(result.error);
                      return;
                    }
                    router.refresh();
                  });
                }}
              >
                {node.status === "active" ? "Deactivate" : "Activate"}
              </Button>
            </div>
          </form>
        ) : (
          <div>
            <p className="font-medium">{node.name}</p>
            <p className="text-xs text-muted">
              {node.description || "No description"} · {node.status}
            </p>
          </div>
        )}

        {canManage ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1 text-sm">
              <span className="text-muted">Parent</span>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="block rounded-md border border-border bg-background px-3 py-2"
              >
                <option value="">Root</option>
                {parentOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                onMessage(null);
                startTransition(async () => {
                  const result = await reparentCategoryAction(node.id, {
                    parentId: parentId || null,
                  });
                  if (!result.ok) {
                    onMessage(result.error);
                    return;
                  }
                  onMessage("Category reparented.");
                  router.refresh();
                });
              }}
            >
              Move
            </Button>
          </div>
        ) : null}
      </div>

      {node.children.length > 0 ? (
        <ul>
          {node.children.map((child) => (
            <CategoryNode
              key={child.id}
              node={child}
              depth={depth + 1}
              canManage={canManage}
              tree={tree}
              onMessage={onMessage}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function CategoriesCatalogPanel({
  tree,
  flat,
  canManage,
}: {
  tree: CategoryTreeNode[];
  flat: ItemCategory[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");

  function createCategory(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await createCategoryAction({
        name,
        parentId: parentId || null,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setName("");
      setParentId("");
      setMessage("Category created.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      {canManage ? (
        <form
          onSubmit={createCategory}
          className="flex flex-wrap items-end gap-3 border border-border bg-surface p-4"
        >
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
            <span className="text-muted">Parent</span>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="block rounded-md border border-border bg-background px-3 py-2"
            >
              <option value="">Root category</option>
              {flat.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Add category"}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted">You can view categories but cannot create or edit them.</p>
      )}

      {message ? <p className="text-sm text-muted">{message}</p> : null}

      {tree.length === 0 ? (
        <p className="text-sm text-muted">No categories yet.</p>
      ) : (
        <ul className="border border-border">
          {tree.map((node) => (
            <CategoryNode
              key={node.id}
              node={node}
              depth={0}
              canManage={canManage}
              tree={tree}
              onMessage={setMessage}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
