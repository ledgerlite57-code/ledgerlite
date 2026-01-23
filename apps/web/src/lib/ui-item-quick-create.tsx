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
  salePrice: string | number;
  purchasePrice?: string | number | null;
  incomeAccountId: string;
  expenseAccountId: string;
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
  taxCodes: TaxCodeOption[];
  onCreated: (item: ItemQuickCreateRecord) => void;
};

const renderFieldError = (message?: string) => (message ? <p className="form-error">{message}</p> : null);

export function ItemQuickCreateDialog({
  open,
  onOpenChange,
  defaultName,
  vatEnabled,
  incomeAccounts,
  expenseAccounts,
  taxCodes,
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
      defaultTaxCodeId: "",
      trackInventory: false,
      reorderPoint: undefined,
      openingQty: undefined,
      openingValue: undefined,
    });
  }, [open, defaultName, form]);

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
              Type *
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-label="Item type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {itemTypeSchema.options.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
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
            <label>
              Expense Account *
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
