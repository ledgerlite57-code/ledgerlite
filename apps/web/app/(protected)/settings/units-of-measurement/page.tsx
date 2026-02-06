"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "../../../../src/lib/zod-resolver";
import {
  Permissions,
  unitOfMeasureCreateSchema,
  type UnitOfMeasureCreateInput,
  type UnitOfMeasureUpdateInput,
  type PaginatedResponse,
} from "@ledgerlite/shared";
import { apiFetch } from "../../../../src/lib/api";
import { Ruler } from "lucide-react";
import { Button } from "../../../../src/lib/ui-button";
import { Input } from "../../../../src/lib/ui-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../src/lib/ui-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../src/lib/ui-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../src/lib/ui-select";
import { usePermissions } from "../../../../src/features/auth/use-permissions";
import { PageHeader } from "../../../../src/lib/ui-page-header";

type UnitRecord = {
  id: string;
  name: string;
  symbol: string;
  baseUnitId?: string | null;
  conversionRate?: string | number | null;
  isActive: boolean;
};

const renderFieldError = (message?: string) => (message ? <p className="form-error">{message}</p> : null);

export default function UnitsOfMeasurementPage() {
  const { hasPermission } = usePermissions();
  const canRead = hasPermission(Permissions.ITEM_READ);
  const canWrite = hasPermission(Permissions.ITEM_WRITE);

  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<UnitRecord | null>(null);

  const form = useForm<UnitOfMeasureCreateInput>({
    resolver: zodResolver(unitOfMeasureCreateSchema),
    defaultValues: {
      name: "",
      symbol: "",
      baseUnitId: undefined,
      conversionRate: 1,
      isActive: true,
    },
  });

  const baseUnits = useMemo(() => units.filter((unit) => !unit.baseUnitId), [units]);
  const baseUnitById = useMemo(() => new Map(baseUnits.map((unit) => [unit.id, unit])), [baseUnits]);

  const loadUnits = useCallback(async () => {
    setSaving(true);
    try {
      setActionError(null);
      const result = await apiFetch<UnitRecord[] | PaginatedResponse<UnitRecord>>("/units-of-measurement");
      const data = Array.isArray(result) ? result : result.data ?? [];
      setUnits(data);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to load units of measure.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canRead) {
      loadUnits();
    }
  }, [canRead, loadUnits]);

  const openCreate = () => {
    setEditingUnit(null);
    form.reset({
      name: "",
      symbol: "",
      baseUnitId: undefined,
      conversionRate: 1,
      isActive: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (unit: UnitRecord) => {
    setEditingUnit(unit);
    form.reset({
      name: unit.name,
      symbol: unit.symbol,
      baseUnitId: unit.baseUnitId ?? undefined,
      conversionRate: unit.baseUnitId ? Number(unit.conversionRate ?? 1) : 1,
      isActive: unit.isActive,
    });
    setDialogOpen(true);
  };

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingUnit(null);
    }
  };

  const baseUnitId = form.watch("baseUnitId");
  useEffect(() => {
    if (!baseUnitId) {
      form.setValue("conversionRate", 1);
    }
  }, [baseUnitId, form]);

  const handleSubmit = async (values: UnitOfMeasureCreateInput) => {
    if (!canWrite) {
      setActionError("You do not have permission to manage units.");
      return;
    }
    setLoading(true);
    try {
      setActionError(null);
      const payload: UnitOfMeasureUpdateInput = {
        ...values,
        conversionRate: values.baseUnitId ? values.conversionRate : 1,
      };
      if (editingUnit) {
        await apiFetch(`/units-of-measurement/${editingUnit.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/units-of-measurement", { method: "POST", body: JSON.stringify(payload) });
      }
      await loadUnits();
      setDialogOpen(false);
      setEditingUnit(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to save unit of measure.");
    } finally {
      setSaving(false);
    }
  };

  if (!canRead) {
    return (
      <div className="card">
        <PageHeader
          title="Settings"
          heading="Units of Measure"
          description="You do not have permission to view units of measure."
          icon={<Ruler className="h-5 w-5" />}
        />
      </div>
    );
  }

  return (
    <div className="card">
      <PageHeader
        title="Settings"
        heading="Units of Measure"
        description="Manage base units and derived conversions for items and documents."
        icon={<Ruler className="h-5 w-5" />}
        actions={canWrite ? <Button onClick={openCreate}>New Unit</Button> : null}
      />

      {actionError ? <p className="form-error">{actionError}</p> : null}
      {loading ? <p className="muted">Loading units...</p> : null}
      {!loading && units.length === 0 ? <p className="muted">No units created yet.</p> : null}

      {units.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Symbol</TableHead>
              <TableHead>Base Unit</TableHead>
              <TableHead>Conversion Rate</TableHead>
              <TableHead>Status</TableHead>
              {canWrite ? <TableHead>Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((unit) => {
              const baseUnit = unit.baseUnitId ? baseUnitById.get(unit.baseUnitId) : null;
              return (
                <TableRow key={unit.id}>
                  <TableCell>{unit.name}</TableCell>
                  <TableCell>{unit.symbol}</TableCell>
                  <TableCell>{baseUnit ? baseUnit.name : "Base"}</TableCell>
                  <TableCell>{unit.baseUnitId ? Number(unit.conversionRate ?? 1).toString() : "1"}</TableCell>
                  <TableCell>{unit.isActive ? "Active" : "Inactive"}</TableCell>
                  {canWrite ? (
                    <TableCell>
                      <Button variant="secondary" onClick={() => openEdit(unit)}>
                        Edit
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUnit ? "Edit unit" : "Create unit"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleSubmit)}>
            <div className="form-grid">
              <label>
                Name *
                <Input {...form.register("name")} />
                {renderFieldError(form.formState.errors.name?.message)}
              </label>
              <label>
                Symbol *
                <Input {...form.register("symbol")} />
                {renderFieldError(form.formState.errors.symbol?.message)}
              </label>
              <label>
                Base Unit
                <Controller
                  control={form.control}
                  name="baseUnitId"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? "none"}
                      onValueChange={(value) => field.onChange(value === "none" ? undefined : value)}
                    >
                      <SelectTrigger aria-label="Base unit">
                        <SelectValue placeholder="Select base unit" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Base unit</SelectItem>
                        {baseUnits.map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.name} ({unit.symbol})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {renderFieldError(form.formState.errors.baseUnitId?.message)}
              </label>
              <label>
                Conversion Rate
                <Input
                  type="number"
                  min={0}
                  step="0.000001"
                  disabled={!baseUnitId}
                  {...form.register("conversionRate")}
                />
                {renderFieldError(form.formState.errors.conversionRate?.message)}
              </label>
              <label>
                Status
                <Controller
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <Select value={field.value === false ? "inactive" : "active"} onValueChange={(value) => field.onChange(value === "active")}>
                      <SelectTrigger aria-label="Unit status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </label>
            </div>
            <div style={{ height: 12 }} />
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : editingUnit ? "Save Unit" : "Create Unit"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
