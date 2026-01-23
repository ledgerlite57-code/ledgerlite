"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SavedViewEntity } from "@ledgerlite/shared";
import { apiFetch } from "../../lib/api";
import { Button } from "../../lib/ui-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../lib/ui-dialog";
import { Input } from "../../lib/ui-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../lib/ui-select";

type SavedViewRecord = {
  id: string;
  entityType: SavedViewEntity;
  name: string;
  query: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

type SavedViewsMenuProps = {
  entityType: SavedViewEntity;
  currentQuery: Record<string, string>;
  onApplyView: (query: Record<string, string>) => void;
};

const buildQueryKey = (query: Record<string, string>) =>
  Object.keys(query)
    .sort()
    .map((key) => `${key}=${query[key]}`)
    .join("&");

export const SavedViewsMenu = ({ entityType, currentQuery, onApplyView }: SavedViewsMenuProps) => {
  const [views, setViews] = useState<SavedViewRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedViewId, setSelectedViewId] = useState<string>("current");
  const [saveOpen, setSaveOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});

  const currentKey = useMemo(() => buildQueryKey(currentQuery), [currentQuery]);

  const loadViews = useCallback(async () => {
    setLoading(true);
    try {
      setActionError(null);
      const result = await apiFetch<SavedViewRecord[]>(`/saved-views?entityType=${entityType}`);
      setViews(result);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to load saved views.");
    } finally {
      setLoading(false);
    }
  }, [entityType]);

  useEffect(() => {
    loadViews();
    setSelectedViewId("current");
  }, [loadViews]);

  useEffect(() => {
    setDraftNames((prev) => {
      const next: Record<string, string> = {};
      views.forEach((view) => {
        next[view.id] = prev[view.id] ?? view.name;
      });
      return next;
    });
  }, [views]);

  useEffect(() => {
    if (selectedViewId === "current") {
      return;
    }
    const selected = views.find((view) => view.id === selectedViewId);
    if (!selected) {
      setSelectedViewId("current");
      return;
    }
    if (buildQueryKey(selected.query) !== currentKey) {
      setSelectedViewId("current");
    }
  }, [currentKey, selectedViewId, views]);

  const handleSelect = (value: string) => {
    if (value === "__save__") {
      setSaveOpen(true);
      return;
    }
    if (value === "__manage__") {
      setManageOpen(true);
      return;
    }
    if (value === "current") {
      setSelectedViewId("current");
      return;
    }

    const selected = views.find((view) => view.id === value);
    if (!selected) {
      return;
    }
    setSelectedViewId(selected.id);
    onApplyView(selected.query);
  };

  const handleSave = async () => {
    const trimmed = saveName.trim();
    if (!trimmed) {
      setActionError("Name is required.");
      return;
    }
    setLoading(true);
    try {
      setActionError(null);
      const created = await apiFetch<SavedViewRecord>("/saved-views", {
        method: "POST",
        body: JSON.stringify({ entityType, name: trimmed, query: currentQuery }),
      });
      setViews((prev) => [created, ...prev]);
      setSaveName("");
      setSaveOpen(false);
      setSelectedViewId(created.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to save view.");
    } finally {
      setLoading(false);
    }
  };

  const handleRename = async (viewId: string) => {
    const name = (draftNames[viewId] ?? "").trim();
    if (!name) {
      setActionError("Name is required.");
      return;
    }
    setLoading(true);
    try {
      setActionError(null);
      const updated = await apiFetch<SavedViewRecord>(`/saved-views/${viewId}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      setViews((prev) => prev.map((view) => (view.id === updated.id ? updated : view)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to update view.");
    } finally {
      setLoading(false);
    }
  };

  const handleReplaceQuery = async (viewId: string) => {
    setLoading(true);
    try {
      setActionError(null);
      const updated = await apiFetch<SavedViewRecord>(`/saved-views/${viewId}`, {
        method: "PATCH",
        body: JSON.stringify({ query: currentQuery }),
      });
      setViews((prev) => prev.map((view) => (view.id === updated.id ? updated : view)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to update view filters.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (viewId: string) => {
    setLoading(true);
    try {
      setActionError(null);
      await apiFetch<{ id: string }>(`/saved-views/${viewId}`, { method: "DELETE" });
      setViews((prev) => prev.filter((view) => view.id !== viewId));
      setSelectedViewId((prev) => (prev === viewId ? "current" : prev));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to delete view.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <label>
      Saved Views
      <Select value={selectedViewId} onValueChange={handleSelect}>
        <SelectTrigger aria-label="Saved views">
          <SelectValue placeholder="Current filters" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="current">Current filters</SelectItem>
          {views.map((view) => (
            <SelectItem key={view.id} value={view.id}>
              {view.name}
            </SelectItem>
          ))}
          <SelectItem value="__save__">Save current view...</SelectItem>
          <SelectItem value="__manage__">Manage views...</SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save current view</DialogTitle>
          </DialogHeader>
          {actionError ? <p className="form-error">{actionError}</p> : null}
          <label>
            View name
            <Input value={saveName} onChange={(event) => setSaveName(event.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSaveOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              Save View
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage saved views</DialogTitle>
          </DialogHeader>
          {actionError ? <p className="form-error">{actionError}</p> : null}
          {views.length === 0 ? (
            <p className="muted">No saved views yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {views.map((view) => (
                <div key={view.id} className="rounded-md border border-border p-3">
                  <label>
                    Name
                    <Input
                      value={draftNames[view.id] ?? view.name}
                      onChange={(event) =>
                        setDraftNames((prev) => ({
                          ...prev,
                          [view.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => handleRename(view.id)} disabled={loading}>
                      Update Name
                    </Button>
                    <Button variant="outline" onClick={() => handleReplaceQuery(view.id)} disabled={loading}>
                      Replace Filters
                    </Button>
                    <Button variant="destructive" onClick={() => handleDelete(view.id)} disabled={loading}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </label>
  );
};
