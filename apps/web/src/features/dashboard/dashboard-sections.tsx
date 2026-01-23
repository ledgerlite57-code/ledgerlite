"use client";

import Link from "next/link";
import { Controller } from "react-hook-form";
import { type MembershipUpdateInput } from "@ledgerlite/shared";
import { Button } from "../../lib/ui-button";
import { Input } from "../../lib/ui-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../lib/ui-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../lib/ui-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../lib/ui-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "../../lib/ui-sheet";
import { formatLabel, renderFieldError } from "./dashboard-utils";
import { type DashboardState } from "./use-dashboard-state";
import { useUiMode } from "../../lib/use-ui-mode";

export function DashboardOrgSetup({ dashboard }: { dashboard: DashboardState }) {
  if (!dashboard.canCreateOrg) {
    return (
      <div className="card" style={{ maxWidth: 720 }}>
        <h1>Organization setup required</h1>
        <p>Contact an administrator to create your organization.</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <h1>Create your organization</h1>
      <p>Set up your base settings to begin configuring the chart of accounts.</p>
      <form onSubmit={dashboard.form.handleSubmit(dashboard.submitOrg)}>
        <div className="form-grid">
          <label>
            Organization Name *
            <Input {...dashboard.form.register("name")} />
            {renderFieldError(dashboard.form.formState.errors.name, "Enter an organization name.")}
          </label>
          <label>
            Country Code *
            <Input {...dashboard.form.register("countryCode")} />
            {renderFieldError(dashboard.form.formState.errors.countryCode, "Use a 2-letter country code.")}
          </label>
          <label>
            Base Currency *
            <Input {...dashboard.form.register("baseCurrency")} />
            {renderFieldError(dashboard.form.formState.errors.baseCurrency, "Use a 3-letter currency code.")}
          </label>
          <label>
            Fiscal Year Start Month *
            <Input
              type="number"
              min={1}
              max={12}
              {...dashboard.form.register("fiscalYearStartMonth", { valueAsNumber: true })}
            />
            {renderFieldError(dashboard.form.formState.errors.fiscalYearStartMonth, "Enter a month between 1 and 12.")}
          </label>
          <label>
            VAT Enabled *
            <input type="checkbox" {...dashboard.form.register("vatEnabled")} />
            {renderFieldError(dashboard.form.formState.errors.vatEnabled)}
          </label>
          <label>
            VAT TRN
            <Input {...dashboard.form.register("vatTrn")} />
            {renderFieldError(dashboard.form.formState.errors.vatTrn, "Enter a valid VAT TRN.")}
          </label>
          <label>
            Time Zone *
            <Input {...dashboard.form.register("timeZone")} />
            {renderFieldError(dashboard.form.formState.errors.timeZone, "Enter a time zone.")}
          </label>
        </div>
        <div style={{ height: 16 }} />
        <Button type="submit" disabled={dashboard.isSubmitting}>
          {dashboard.isSubmitting ? "Creating..." : "Create Organization"}
        </Button>
      </form>
    </div>
  );
}

export function DashboardOverviewSection({ dashboard }: { dashboard: DashboardState }) {
  const { mode, setMode } = useUiMode();
  return (
    <section>
      <h2>Get started</h2>
      <p>Use the sidebar to manage your chart of accounts and user access.</p>
      <div style={{ height: 12 }} />
      <div className="section-header">
        <div>
          <strong>Interface mode</strong>
          <p>Simple mode keeps forms concise. Accountant mode reveals advanced fields.</p>
        </div>
        <Select value={mode} onValueChange={(value) => setMode(value as "simple" | "accountant")}>
          <SelectTrigger aria-label="UI mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="simple">Simple</SelectItem>
            <SelectItem value="accountant">Accountant</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div style={{ height: 12 }} />
      {dashboard.canViewAccounts ? (
        <>
          <div className="section-header">
            <div>
              <strong>Chart of Accounts</strong>
              <p>{dashboard.accounts.length} accounts configured</p>
            </div>
            <Button asChild variant="secondary">
              <Link href="/dashboard?tab=accounts">Open accounts</Link>
            </Button>
          </div>
          <div style={{ height: 12 }} />
        </>
      ) : null}
      {dashboard.canViewCustomers ? (
        <>
          <div className="section-header">
            <div>
              <strong>Customers</strong>
              <p>{dashboard.customers.length} active customers</p>
            </div>
            <Button asChild variant="secondary">
              <Link href="/dashboard?tab=customers">Open customers</Link>
            </Button>
          </div>
          <div style={{ height: 12 }} />
        </>
      ) : null}
      {dashboard.canViewVendors ? (
        <>
          <div className="section-header">
            <div>
              <strong>Vendors</strong>
              <p>{dashboard.vendors.length} active vendors</p>
            </div>
            <Button asChild variant="secondary">
              <Link href="/dashboard?tab=vendors">Open vendors</Link>
            </Button>
          </div>
          <div style={{ height: 12 }} />
        </>
      ) : null}
      {dashboard.canViewItems ? (
        <>
          <div className="section-header">
            <div>
              <strong>Items</strong>
              <p>{dashboard.items.length} items configured</p>
            </div>
            <Button asChild variant="secondary">
              <Link href="/dashboard?tab=items">Open items</Link>
            </Button>
          </div>
          <div style={{ height: 12 }} />
        </>
      ) : null}
      {dashboard.canViewTaxes && dashboard.vatEnabled ? (
        <>
          <div className="section-header">
            <div>
              <strong>Tax Codes</strong>
              <p>{dashboard.taxCodes.length} tax codes configured</p>
            </div>
            <Button asChild variant="secondary">
              <Link href="/dashboard?tab=taxes">Open tax codes</Link>
            </Button>
          </div>
          <div style={{ height: 12 }} />
        </>
      ) : null}
      {dashboard.canViewUsers ? (
        <div className="section-header">
          <div>
            <strong>Users</strong>
            <p>{dashboard.memberships.length} team members</p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/dashboard?tab=users">Open users</Link>
          </Button>
        </div>
      ) : null}
    </section>
  );
}

export function DashboardAccountsSection({ dashboard }: { dashboard: DashboardState }) {
  if (!dashboard.canViewAccounts) {
    return null;
  }

  return (
    <section id="accounts">
      <div className="section-header">
        <h2>Chart of Accounts</h2>
        {dashboard.canManageAccounts ? (
          <Sheet>
            <SheetTrigger asChild>
              <Button>New Account</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Create account</SheetTitle>
              </SheetHeader>
              <form onSubmit={dashboard.accountForm.handleSubmit(dashboard.submitAccount)}>
                <div className="form-grid">
                  <label>
                    Code *
                    <Input {...dashboard.accountForm.register("code")} />
                    {renderFieldError(dashboard.accountForm.formState.errors.code, "Enter an account code.")}
                  </label>
                  <label>
                    Name *
                    <Input {...dashboard.accountForm.register("name")} />
                    {renderFieldError(dashboard.accountForm.formState.errors.name, "Enter an account name.")}
                  </label>
                  <label>
                    Type *
                    <Controller
                      control={dashboard.accountForm.control}
                      name="type"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ASSET">Asset</SelectItem>
                            <SelectItem value="LIABILITY">Liability</SelectItem>
                            <SelectItem value="EQUITY">Equity</SelectItem>
                            <SelectItem value="INCOME">Income</SelectItem>
                            <SelectItem value="EXPENSE">Expense</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {renderFieldError(dashboard.accountForm.formState.errors.type, "Select an account type.")}
                  </label>
                  <label>
                    Subtype
                    <Controller
                      control={dashboard.accountForm.control}
                      name="subtype"
                      render={({ field }) => (
                        <Select
                          value={field.value ?? "none"}
                          onValueChange={(value) => field.onChange(value === "none" ? undefined : value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select subtype" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {dashboard.filteredSubtypeOptions.map((option) => (
                              <SelectItem key={option} value={option}>
                                {formatLabel(option)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {renderFieldError(dashboard.accountForm.formState.errors.subtype, "Select a subtype.")}
                  </label>
                </div>
                <div style={{ height: 12 }} />
                <Button type="submit">Add Account</Button>
              </form>
            </SheetContent>
          </Sheet>
        ) : null}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dashboard.accounts.map((account) => (
            <TableRow key={account.id}>
              <TableCell>{account.code}</TableCell>
              <TableCell>{account.name}</TableCell>
              <TableCell>{account.subtype ? formatLabel(account.subtype) : formatLabel(account.type)}</TableCell>
              <TableCell>{account.isActive ? "Active" : "Inactive"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

export function DashboardCustomersSection({ dashboard }: { dashboard: DashboardState }) {
  if (!dashboard.canViewCustomers) {
    return null;
  }

  return (
    <section id="customers">
      <div className="section-header">
        <h2>Customers</h2>
        {dashboard.canManageCustomers ? (
          <Button onClick={() => dashboard.openCustomerSheet()}>New Customer</Button>
        ) : null}
      </div>
      <div className="form-grid">
        <label>
          Search
          <Input value={dashboard.customerSearch} onChange={(event) => dashboard.setCustomerSearch(event.target.value)} />
        </label>
        <label>
          Status
          <Select value={dashboard.customerStatus} onValueChange={dashboard.setCustomerStatus}>
            <SelectTrigger aria-label="Customer status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <div style={{ alignSelf: "end" }}>
          <Button variant="secondary" onClick={() => dashboard.loadCustomers()}>
            Apply Filters
          </Button>
        </div>
      </div>
      <div style={{ height: 12 }} />
      {dashboard.loadingCustomers ? <p>Loading customers...</p> : null}
      {!dashboard.loadingCustomers && dashboard.customers.length === 0 ? <p>No customers yet. Add your first customer.</p> : null}
      {dashboard.customers.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Terms</TableHead>
              <TableHead>Status</TableHead>
              {dashboard.canManageCustomers ? <TableHead>Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {dashboard.customers.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell>{customer.name}</TableCell>
                <TableCell>{customer.email ?? "-"}</TableCell>
                <TableCell>{customer.phone ?? "-"}</TableCell>
                <TableCell>{customer.paymentTermsDays} days</TableCell>
                <TableCell>
                  {dashboard.canManageCustomers ? (
                    <Select
                      value={customer.isActive ? "active" : "inactive"}
                      onValueChange={(value) => dashboard.updateCustomerStatus(customer.id, value === "active")}
                    >
                      <SelectTrigger aria-label="Customer status toggle">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : customer.isActive ? (
                    "Active"
                  ) : (
                    "Inactive"
                  )}
                </TableCell>
                {dashboard.canManageCustomers ? (
                  <TableCell>
                    <Button variant="secondary" onClick={() => dashboard.openCustomerSheet(customer)}>
                      Edit
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      {dashboard.canManageCustomers ? (
        <Sheet
          open={dashboard.customerSheetOpen}
          onOpenChange={(open) => {
            dashboard.setCustomerSheetOpen(open);
            if (!open) {
              dashboard.setEditingCustomer(null);
            }
          }}
        >
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{dashboard.editingCustomer ? "Edit customer" : "Create customer"}</SheetTitle>
            </SheetHeader>
            <form onSubmit={dashboard.customerForm.handleSubmit(dashboard.submitCustomer)}>
              <div className="form-grid">
                <label>
                  Name *
                  <Input {...dashboard.customerForm.register("name")} />
                  {renderFieldError(dashboard.customerForm.formState.errors.name, "Enter a customer name.")}
                </label>
                <label>
                  Email
                  <Input {...dashboard.customerForm.register("email")} />
                  {renderFieldError(dashboard.customerForm.formState.errors.email, "Enter a valid email.")}
                </label>
                <label>
                  Phone
                  <Input {...dashboard.customerForm.register("phone")} />
                  {renderFieldError(dashboard.customerForm.formState.errors.phone, "Enter a valid phone.")}
                </label>
                <label>
                  Billing Address
                  <Input {...dashboard.customerForm.register("billingAddress")} />
                  {renderFieldError(dashboard.customerForm.formState.errors.billingAddress)}
                </label>
                <label>
                  Shipping Address
                  <Input {...dashboard.customerForm.register("shippingAddress")} />
                  {renderFieldError(dashboard.customerForm.formState.errors.shippingAddress)}
                </label>
                <label>
                  TRN
                  <Input {...dashboard.customerForm.register("trn")} />
                  {renderFieldError(dashboard.customerForm.formState.errors.trn)}
                </label>
                <label>
                  Payment Terms (days) *
                  <Input type="number" min={0} {...dashboard.customerForm.register("paymentTermsDays")} />
                  {renderFieldError(dashboard.customerForm.formState.errors.paymentTermsDays, "Enter payment terms.")}
                </label>
                <label>
                  Credit Limit
                  <Input type="number" min={0} step="0.01" {...dashboard.customerForm.register("creditLimit")} />
                  {renderFieldError(dashboard.customerForm.formState.errors.creditLimit, "Enter a valid credit limit.")}
                </label>
              </div>
              <div style={{ height: 12 }} />
              <Button type="submit">
                {dashboard.editingCustomer ? "Save Customer" : "Create Customer"}
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      ) : null}
    </section>
  );
}

export function DashboardVendorsSection({ dashboard }: { dashboard: DashboardState }) {
  if (!dashboard.canViewVendors) {
    return null;
  }

  return (
    <section id="vendors">
      <div className="section-header">
        <h2>Vendors</h2>
        {dashboard.canManageVendors ? (
          <Button onClick={() => dashboard.openVendorSheet()}>New Vendor</Button>
        ) : null}
      </div>
      <div className="form-grid">
        <label>
          Search
          <Input value={dashboard.vendorSearch} onChange={(event) => dashboard.setVendorSearch(event.target.value)} />
        </label>
        <label>
          Status
          <Select value={dashboard.vendorStatus} onValueChange={dashboard.setVendorStatus}>
            <SelectTrigger aria-label="Vendor status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <div style={{ alignSelf: "end" }}>
          <Button variant="secondary" onClick={() => dashboard.loadVendors()}>
            Apply Filters
          </Button>
        </div>
      </div>
      <div style={{ height: 12 }} />
      {dashboard.loadingVendors ? <p>Loading vendors...</p> : null}
      {!dashboard.loadingVendors && dashboard.vendors.length === 0 ? <p>No vendors yet. Add your first vendor.</p> : null}
      {dashboard.vendors.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Terms</TableHead>
              <TableHead>Status</TableHead>
              {dashboard.canManageVendors ? <TableHead>Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {dashboard.vendors.map((vendor) => (
              <TableRow key={vendor.id}>
                <TableCell>{vendor.name}</TableCell>
                <TableCell>{vendor.email ?? "-"}</TableCell>
                <TableCell>{vendor.phone ?? "-"}</TableCell>
                <TableCell>{vendor.paymentTermsDays} days</TableCell>
                <TableCell>
                  {dashboard.canManageVendors ? (
                    <Select
                      value={vendor.isActive ? "active" : "inactive"}
                      onValueChange={(value) => dashboard.updateVendorStatus(vendor.id, value === "active")}
                    >
                      <SelectTrigger aria-label="Vendor status toggle">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : vendor.isActive ? (
                    "Active"
                  ) : (
                    "Inactive"
                  )}
                </TableCell>
                {dashboard.canManageVendors ? (
                  <TableCell>
                    <Button variant="secondary" onClick={() => dashboard.openVendorSheet(vendor)}>
                      Edit
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      {dashboard.canManageVendors ? (
        <Sheet
          open={dashboard.vendorSheetOpen}
          onOpenChange={(open) => {
            dashboard.setVendorSheetOpen(open);
            if (!open) {
              dashboard.setEditingVendor(null);
            }
          }}
        >
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{dashboard.editingVendor ? "Edit vendor" : "Create vendor"}</SheetTitle>
            </SheetHeader>
            <form onSubmit={dashboard.vendorForm.handleSubmit(dashboard.submitVendor)}>
              <div className="form-grid">
                <label>
                  Name *
                  <Input {...dashboard.vendorForm.register("name")} />
                  {renderFieldError(dashboard.vendorForm.formState.errors.name, "Enter a vendor name.")}
                </label>
                <label>
                  Email
                  <Input {...dashboard.vendorForm.register("email")} />
                  {renderFieldError(dashboard.vendorForm.formState.errors.email, "Enter a valid email.")}
                </label>
                <label>
                  Phone
                  <Input {...dashboard.vendorForm.register("phone")} />
                  {renderFieldError(dashboard.vendorForm.formState.errors.phone, "Enter a valid phone.")}
                </label>
                <label>
                  Address
                  <Input {...dashboard.vendorForm.register("address")} />
                  {renderFieldError(dashboard.vendorForm.formState.errors.address)}
                </label>
                <label>
                  TRN
                  <Input {...dashboard.vendorForm.register("trn")} />
                  {renderFieldError(dashboard.vendorForm.formState.errors.trn)}
                </label>
                <label>
                  Payment Terms (days) *
                  <Input type="number" min={0} {...dashboard.vendorForm.register("paymentTermsDays")} />
                  {renderFieldError(dashboard.vendorForm.formState.errors.paymentTermsDays, "Enter payment terms.")}
                </label>
              </div>
              <div style={{ height: 12 }} />
              <Button type="submit">
                {dashboard.editingVendor ? "Save Vendor" : "Create Vendor"}
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      ) : null}
    </section>
  );
}

export function DashboardItemsSection({ dashboard }: { dashboard: DashboardState }) {
  if (!dashboard.canViewItems) {
    return null;
  }
  const trackInventory = dashboard.itemForm.watch("trackInventory");

  return (
    <section id="items">
      <div className="section-header">
        <h2>Items</h2>
        {dashboard.canManageItems ? <Button onClick={() => dashboard.openItemSheet()}>New Item</Button> : null}
      </div>
      <div className="form-grid">
        <label>
          Search
          <Input value={dashboard.itemSearch} onChange={(event) => dashboard.setItemSearch(event.target.value)} />
        </label>
        <label>
          Status
          <Select value={dashboard.itemStatus} onValueChange={dashboard.setItemStatus}>
            <SelectTrigger aria-label="Item status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <div style={{ alignSelf: "end" }}>
          <Button variant="secondary" onClick={() => dashboard.loadItems()}>
            Apply Filters
          </Button>
        </div>
      </div>
      <div style={{ height: 12 }} />
      {dashboard.loadingItems ? <p>Loading items...</p> : null}
      {!dashboard.loadingItems && dashboard.items.length === 0 ? <p>No items yet. Add your first product or service.</p> : null}
      {dashboard.items.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Sale Price</TableHead>
              <TableHead>Income Account</TableHead>
              <TableHead>Expense Account</TableHead>
              <TableHead>Track Inventory</TableHead>
              <TableHead>Status</TableHead>
              {dashboard.canManageItems ? <TableHead>Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {dashboard.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.sku ?? "-"}</TableCell>
                <TableCell>{formatLabel(item.type)}</TableCell>
                <TableCell>{item.salePrice}</TableCell>
                <TableCell>{item.incomeAccount?.name ?? "-"}</TableCell>
                <TableCell>{item.expenseAccount?.name ?? "-"}</TableCell>
                <TableCell>{item.trackInventory ? "Yes" : "No"}</TableCell>
                <TableCell>
                  {dashboard.canManageItems ? (
                    <Select
                      value={item.isActive ? "active" : "inactive"}
                      onValueChange={(value) => dashboard.updateItemStatus(item.id, value === "active")}
                    >
                      <SelectTrigger aria-label="Item status toggle">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : item.isActive ? (
                    "Active"
                  ) : (
                    "Inactive"
                  )}
                </TableCell>
                {dashboard.canManageItems ? (
                  <TableCell>
                    <Button variant="secondary" onClick={() => dashboard.openItemSheet(item)}>
                      Edit
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      {dashboard.canManageItems ? (
        <Sheet
          open={dashboard.itemSheetOpen}
          onOpenChange={(open) => {
            dashboard.setItemSheetOpen(open);
            if (!open) {
              dashboard.setEditingItem(null);
            }
          }}
        >
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{dashboard.editingItem ? "Edit item" : "Create item"}</SheetTitle>
            </SheetHeader>
            <form onSubmit={dashboard.itemForm.handleSubmit(dashboard.submitItem)}>
              <div className="form-grid">
                <label>
                  Name *
                  <Input {...dashboard.itemForm.register("name")} />
                  {renderFieldError(dashboard.itemForm.formState.errors.name, "Enter an item name.")}
                </label>
                <label>
                  Type *
                  <Controller
                    control={dashboard.itemForm.control}
                    name="type"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger aria-label="Item type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {dashboard.itemTypeOptions.map((option) => (
                            <SelectItem key={option} value={option}>
                              {formatLabel(option)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {renderFieldError(dashboard.itemForm.formState.errors.type, "Select an item type.")}
                </label>
                <label>
                  SKU
                  <Input {...dashboard.itemForm.register("sku")} />
                  {renderFieldError(dashboard.itemForm.formState.errors.sku)}
                </label>
                <label>
                  Sale Price *
                  <Input type="number" min={0} step="0.01" {...dashboard.itemForm.register("salePrice")} />
                  {renderFieldError(dashboard.itemForm.formState.errors.salePrice, "Enter a valid sale price.")}
                </label>
                <label>
                  Purchase Price
                  <Input type="number" min={0} step="0.01" {...dashboard.itemForm.register("purchasePrice")} />
                  {renderFieldError(dashboard.itemForm.formState.errors.purchasePrice, "Enter a valid purchase price.")}
                </label>
                <label>
                  Income Account *
                  <Controller
                    control={dashboard.itemForm.control}
                    name="incomeAccountId"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger aria-label="Income account">
                          <SelectValue placeholder="Select income account" />
                        </SelectTrigger>
                        <SelectContent>
                          {dashboard.incomeAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {renderFieldError(dashboard.itemForm.formState.errors.incomeAccountId, "Select an income account.")}
                </label>
                <label>
                  Expense Account *
                  <Controller
                    control={dashboard.itemForm.control}
                    name="expenseAccountId"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger aria-label="Expense account">
                          <SelectValue placeholder="Select expense account" />
                        </SelectTrigger>
                        <SelectContent>
                          {dashboard.expenseAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {renderFieldError(dashboard.itemForm.formState.errors.expenseAccountId, "Select an expense account.")}
                </label>
                {dashboard.vatEnabled ? (
                  <label>
                    Default Tax Code
                    <Controller
                      control={dashboard.itemForm.control}
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
                            {dashboard.activeTaxCodes.map((code) => (
                              <SelectItem key={code.id} value={code.id}>
                                {code.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {renderFieldError(dashboard.itemForm.formState.errors.defaultTaxCodeId, "Select a tax code.")}
                  </label>
                ) : null}
                <label>
                  Track Inventory
                  <input type="checkbox" {...dashboard.itemForm.register("trackInventory")} />
                  {renderFieldError(dashboard.itemForm.formState.errors.trackInventory)}
                </label>
                {trackInventory ? (
                  <>
                    <label>
                      Reorder Point
                      <Input type="number" min={0} {...dashboard.itemForm.register("reorderPoint")} />
                      {renderFieldError(dashboard.itemForm.formState.errors.reorderPoint, "Enter a reorder point.")}
                    </label>
                    <label>
                      Opening Quantity
                      <Input type="number" min={0} step="0.01" {...dashboard.itemForm.register("openingQty")} />
                      {renderFieldError(dashboard.itemForm.formState.errors.openingQty, "Enter opening quantity.")}
                    </label>
                    <label>
                      Opening Value
                      <Input type="number" min={0} step="0.01" {...dashboard.itemForm.register("openingValue")} />
                      {renderFieldError(dashboard.itemForm.formState.errors.openingValue, "Enter opening value.")}
                    </label>
                  </>
                ) : null}
              </div>
              <div style={{ height: 12 }} />
              <Button type="submit">
                {dashboard.editingItem ? "Save Item" : "Create Item"}
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      ) : null}
    </section>
  );
}

export function DashboardTaxCodesSection({ dashboard }: { dashboard: DashboardState }) {
  if (!dashboard.canViewTaxes) {
    return null;
  }

  return (
    <section id="taxes">
      <div className="section-header">
        <h2>Tax Codes</h2>
        {dashboard.canManageTaxes ? (
          <Button onClick={() => dashboard.openTaxSheet()} disabled={!dashboard.vatEnabled}>
            New Tax Code
          </Button>
        ) : null}
      </div>
      {!dashboard.vatEnabled ? <p>VAT is disabled for this organization.</p> : null}
      {dashboard.vatEnabled ? (
        <>
          <div className="form-grid">
            <label>
              Search
              <Input value={dashboard.taxSearch} onChange={(event) => dashboard.setTaxSearch(event.target.value)} />
            </label>
            <label>
              Status
              <Select value={dashboard.taxStatus} onValueChange={dashboard.setTaxStatus}>
                <SelectTrigger aria-label="Tax status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <div style={{ alignSelf: "end" }}>
              <Button variant="secondary" onClick={() => dashboard.loadTaxCodes()}>
                Apply Filters
              </Button>
            </div>
          </div>
          <div style={{ height: 12 }} />
          {dashboard.loadingTaxCodes ? <p>Loading tax codes...</p> : null}
          {!dashboard.loadingTaxCodes && dashboard.taxCodes.length === 0 ? <p>No tax codes yet. Add your first tax rate.</p> : null}
          {dashboard.taxCodes.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  {dashboard.canManageTaxes ? <TableHead>Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.taxCodes.map((code) => (
                  <TableRow key={code.id}>
                    <TableCell>{code.name}</TableCell>
                    <TableCell>{Number(code.rate)}%</TableCell>
                    <TableCell>{formatLabel(code.type)}</TableCell>
                    <TableCell>
                      {dashboard.canManageTaxes ? (
                        <Select
                          value={code.isActive ? "active" : "inactive"}
                          onValueChange={(value) => dashboard.updateTaxStatus(code.id, value === "active")}
                        >
                          <SelectTrigger aria-label="Tax status toggle">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : code.isActive ? (
                        "Active"
                      ) : (
                        "Inactive"
                      )}
                    </TableCell>
                    {dashboard.canManageTaxes ? (
                      <TableCell>
                        <Button variant="secondary" onClick={() => dashboard.openTaxSheet(code)}>
                          Edit
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
          {dashboard.canManageTaxes ? (
            <Sheet
              open={dashboard.taxSheetOpen}
              onOpenChange={(open) => {
                dashboard.setTaxSheetOpen(open);
                if (!open) {
                  dashboard.setEditingTaxCode(null);
                }
              }}
            >
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>{dashboard.editingTaxCode ? "Edit tax code" : "Create tax code"}</SheetTitle>
                </SheetHeader>
                <form onSubmit={dashboard.taxForm.handleSubmit(dashboard.submitTaxCode)}>
                  <div className="form-grid">
                    <label>
                      Name *
                      <Input {...dashboard.taxForm.register("name")} />
                      {renderFieldError(dashboard.taxForm.formState.errors.name, "Enter a tax code name.")}
                    </label>
                    <label>
                      Rate (%) *
                      <Input type="number" min={0} max={100} step="0.01" {...dashboard.taxForm.register("rate")} />
                      {renderFieldError(dashboard.taxForm.formState.errors.rate, "Enter a valid tax rate.")}
                    </label>
                    <label>
                      Type *
                      <Controller
                        control={dashboard.taxForm.control}
                        name="type"
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger aria-label="Tax type">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              {dashboard.taxTypeOptions.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {formatLabel(option)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {renderFieldError(dashboard.taxForm.formState.errors.type, "Select a tax type.")}
                    </label>
                  </div>
                  <div style={{ height: 12 }} />
                  <Button type="submit">
                    {dashboard.editingTaxCode ? "Save Tax Code" : "Create Tax Code"}
                  </Button>
                </form>
              </SheetContent>
            </Sheet>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export function DashboardUsersSection({ dashboard }: { dashboard: DashboardState }) {
  if (!dashboard.canViewUsers) {
    return null;
  }

  return (
    <section id="users">
      <div className="section-header">
        <h2>Users</h2>
        {dashboard.canInviteUsers ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button>Invite User</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite user</DialogTitle>
              </DialogHeader>
              <form onSubmit={dashboard.inviteForm.handleSubmit(dashboard.submitInvite)}>
                <div className="form-grid">
                  <label>
                    Email *
                    <Input {...dashboard.inviteForm.register("email")} />
                    {renderFieldError(dashboard.inviteForm.formState.errors.email, "Enter a valid email.")}
                  </label>
                  <label>
                    Role *
                    <Controller
                      control={dashboard.inviteForm.control}
                      name="roleId"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            {dashboard.roles.map((role) => (
                              <SelectItem key={role.id} value={role.id}>
                                {role.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {renderFieldError(dashboard.inviteForm.formState.errors.roleId, "Select a role.")}
                  </label>
                </div>
                <div style={{ height: 12 }} />
                <Button type="submit">
                  Send Invite
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
      {!dashboard.canManageUsers ? <p className="muted">You do not have permission to manage users.</p> : null}
      {dashboard.canManageUsers ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dashboard.memberships.map((membership) => (
              <TableRow key={membership.id}>
                <TableCell>{membership.user.email}</TableCell>
                <TableCell>
                  {dashboard.canManageUsers ? (
                    <Select
                      value={membership.role.id}
                      onValueChange={(value) => dashboard.updateMembership(membership.id, { roleId: value } as MembershipUpdateInput)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {dashboard.roles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    membership.role.name
                  )}
                </TableCell>
                <TableCell>
                  {dashboard.canManageUsers ? (
                    <Select
                      value={membership.isActive ? "active" : "inactive"}
                      onValueChange={(value) => dashboard.updateMembership(membership.id, { isActive: value === "active" })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : membership.isActive ? (
                    "Active"
                  ) : (
                    "Inactive"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </section>
  );
}
