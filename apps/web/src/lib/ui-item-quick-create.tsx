import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  itemCreateSchema,
  itemTypeSchema,
  type ItemCreateInput,
} from "@ledgerlite/shared";
import { zodResolver } from "./zod-resolver";
import { apiFetch } from "./api";
import { normalizeError } from "./errors";
import { toast } from "./use-toast";
import { Button } from "./ui-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui-dialog";
import { Input } from "./ui-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui-select";

type AccountOption = { id: string; name: string };
type TaxCodeOption = { id: string; name: string; isActive: boolean };

export type ItemQuickCreateRecord = {
  id: string;
  name: string;
  type: string;
  salePrice: string | number;
  purchasePrice?: string | number | null;
  incomeAccountId?: string | null;
  expenseAccountId?: string | null;
  inventoryAccountId?: string | null;
  fixedAssetAccountId?: string | null;
  trackInventory?: boolean;
  unitOfMeasureId?: string | null;
  defaultTaxCodeId?: string | null;
  isActive: boolean;
};

type ItemQuickCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName?: string;
  vatEnabled: boolean;
  incomeAccounts: AccountOption[];
  expenseAccounts: AccountOption[];
  assetAccounts: AccountOption[];
  taxCodes: TaxCodeOption[];
  allowedCategories?: ItemCreateInput["type"][];
  onCreated: (item: ItemQuickCreateRecord) => void;
};

const renderFieldError = (message?: string) => (message ? <p className="form-error">{message}</p> : null);
const formatLabel = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");

export function ItemQuickCreateDialog({
  open,
  onOpenChange,
  defaultName,
  vatEnabled,
  incomeAccounts,
  expenseAccounts,
  assetAccounts,
  taxCodes,
  allowedCategories,
  onCreated,
}: ItemQuickCreateDialogProps) {
  const form = useForm<ItemCreateInput>({
    resolver: zodResolver(itemCreateSchema),
    defaultValues: {
      name: defaultName ?? "",
      type: "SERVICE",
      sku: "",
      salePrice: 0,
      purchasePrice: undefined,
      incomeAccountId: "",
      expenseAccountId: "",
      inventoryAccountId: "",
      fixedAssetAccountId: "",
      defaultTaxCodeId: "",
      trackInventory: false,
      reorderPoint: undefined,
      openingQty: undefined,
      openingValue: undefined,
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    form.reset({
      name: defaultName ?? "",
      type: "SERVICE",
      sku: "",
      salePrice: 0,
      purchasePrice: undefined,
      incomeAccountId: "",
      expenseAccountId: "",
      inventoryAccountId: "",
      fixedAssetAccountId: "",
      defaultTaxCodeId: "",
      trackInventory: false,
      reorderPoint: undefined,
      openingQty: undefined,
      openingValue: undefined,
    });
  }, [open, defaultName, form]);

  const category = form.watch("type") ?? "SERVICE";
  const isInventory = category === "INVENTORY";
  const isService = category === "SERVICE";
  const isFixedAsset = category === "FIXED_ASSET";
  const isNonInventory = category === "NON_INVENTORY_EXPENSE";

  useEffect(() => {
    form.setValue("trackInventory", isInventory);
  }, [form, isInventory]);

  const categoryOptions = allowedCategories?.length
    ? itemTypeSchema.options.filter((option) => allowedCategories.includes(option as ItemCreateInput["type"]))
    : itemTypeSchema.options;

  const categoryHelp =
    category === "INVENTORY"
      ? "Stocked goods. Requires income, COGS, and inventory asset accounts."
      : category === "FIXED_ASSET"
        ? "Capitalized assets. Requires a fixed asset account."
        : category === "NON_INVENTORY_EXPENSE"
          ? "Non-stock expenses. Requires an expense account."
          : "Services require an income account. Expense account is optional.";

  const submit = async (values: ItemCreateInput) => {
    try {
      const created = await apiFetch<ItemQuickCreateRecord>("/items", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(values),
      });
      toast({ title: "Item created", description: `${created.name} is ready to use.` });
      onCreated(created);
      onOpenChange(false);
    } catch (err) {
      const normalized = normalizeError(err);
      toast({
        variant: "destructive",
        title: "Unable to create item",
        description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quick create item</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(submit)}>
          <div className="form-grid">
            <label>
              Name *
              <Input {...form.register("name")} />
              {renderFieldError(form.formState.errors.name?.message)}
            </label>
            <label>
              Category *
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-label="Item category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {formatLabel(option)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="muted">{categoryHelp}</p>
              {renderFieldError(form.formState.errors.type?.message)}
            </label>
            <label>
              SKU
              <Input {...form.register("sku")} />
            </label>
            <label>
              Sale Price *
              <Input type="number" min={0} step="0.01" {...form.register("salePrice")} />
              {renderFieldError(form.formState.errors.salePrice?.message)}
            </label>
            <label>
              Purchase Price
              <Input type="number" min={0} step="0.01" {...form.register("purchasePrice")} />
              {renderFieldError(form.formState.errors.purchasePrice?.message)}
            </label>
            {isService || isInventory ? (
              <label>
                Income Account *
                <Controller
                  control={form.control}
                  name="incomeAccountId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger aria-label="Income account">
                        <SelectValue placeholder="Select income account" />
                      </SelectTrigger>
                      <SelectContent>
                        {incomeAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {renderFieldError(form.formState.errors.incomeAccountId?.message)}
              </label>
            ) : null}
            {isService || isInventory || isNonInventory ? (
              <label>
                {isInventory ? "COGS Account *" : isService ? "Expense Account (optional)" : "Expense Account *"}
                <Controller
                  control={form.control}
                  name="expenseAccountId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger aria-label="Expense account">
                        <SelectValue placeholder="Select expense account" />
                      </SelectTrigger>
                      <SelectContent>
                        {expenseAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {renderFieldError(form.formState.errors.expenseAccountId?.message)}
              </label>
            ) : null}
            {isInventory ? (
              <label>
                Inventory Asset Account *
                <Controller
                  control={form.control}
                  name="inventoryAccountId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger aria-label="Inventory asset account">
                        <SelectValue placeholder="Select inventory account" />
                      </SelectTrigger>
                      <SelectContent>
                        {assetAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {renderFieldError(form.formState.errors.inventoryAccountId?.message)}
              </label>
            ) : null}
            {isFixedAsset ? (
              <label>
                Fixed Asset Account *
                <Controller
                  control={form.control}
                  name="fixedAssetAccountId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger aria-label="Fixed asset account">
                        <SelectValue placeholder="Select fixed asset account" />
                      </SelectTrigger>
                      <SelectContent>
                        {assetAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {renderFieldError(form.formState.errors.fixedAssetAccountId?.message)}
              </label>
            ) : null}
            {vatEnabled ? (
              <label>
                Default Tax Code
                <Controller
                  control={form.control}
                  name="defaultTaxCodeId"
                  render={({ field }) => (
                    <Select
                      value={field.value ? field.value : "none"}
                      onValueChange={(value) => field.onChange(value === "none" ? undefined : value)}
                    >
                      <SelectTrigger aria-label="Default tax code">
                        <SelectValue placeholder="Select tax code" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {taxCodes.filter((code) => code.isActive).map((code) => (
                          <SelectItem key={code.id} value={code.id}>
                            {code.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {renderFieldError(form.formState.errors.defaultTaxCodeId?.message)}
              </label>
            ) : null}
            {isInventory ? (
              <label>
                Track Inventory
                <input type="checkbox" disabled {...form.register("trackInventory")} />
                <p className="muted">Inventory tracking is required for stocked items.</p>
                {renderFieldError(form.formState.errors.trackInventory?.message)}
              </label>
            ) : null}
          </div>
          <div style={{ height: 12 }} />
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Creating..." : "Create Item"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
