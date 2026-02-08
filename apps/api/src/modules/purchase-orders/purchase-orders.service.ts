import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, InventorySourceType, Prisma, PurchaseOrderStatus } from "@prisma/client";
import {
  type PaginationInput,
  type PurchaseOrderConvertInput,
  type PurchaseOrderCreateInput,
  type PurchaseOrderReceiveInput,
  type PurchaseOrderRejectInput,
  type PurchaseOrderUpdateInput,
} from "@ledgerlite/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { MailerService } from "../../common/mailer.service";
import { PurchaseOrdersRepository } from "./purchase-orders.repo";
import { buildIdempotencyKey, hashRequestBody } from "../../common/idempotency";
import { ensureNotLocked, isDateLocked } from "../../common/lock-date";
import { calculateBillLines } from "../../bills.utils";
import { dec, round2 } from "../../common/money";
import { RequestContext } from "../../logging/request-context";
import { buildPurchaseOrderPdf } from "./purchase-orders.pdf";

type PurchaseOrderDetail = Prisma.PurchaseOrderGetPayload<{
  include: {
    vendor: true;
    bills: true;
    lines: { include: { item: true; taxCode: true; expenseAccount: true; unitOfMeasure: true } };
  };
}>;

type PurchaseOrderListParams = PaginationInput & {
  status?: string;
  vendorId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  amountMin?: number;
  amountMax?: number;
};

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly repo: PurchaseOrdersRepository,
    private readonly mailer: MailerService,
  ) {}

  async listPurchaseOrders(orgId?: string, params?: PurchaseOrderListParams) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;
    const { data, total } = await this.repo.list({
      orgId,
      q: params?.q,
      status: params?.status,
      vendorId: params?.vendorId,
      dateFrom: params?.dateFrom,
      dateTo: params?.dateTo,
      amountMin: params?.amountMin,
      amountMax: params?.amountMax,
      page,
      pageSize,
      sortBy: params?.sortBy,
      sortDir: params?.sortDir,
    });
    return {
      data: data.map((po) => ({
        ...po,
        remainingAmount: round2(dec(po.total).sub(po.billedAmount)),
      })),
      pageInfo: { page, pageSize, total },
    };
  }

  async getPurchaseOrder(orgId?: string, purchaseOrderId?: string) {
    if (!orgId || !purchaseOrderId) {
      throw new NotFoundException("Purchase order not found");
    }
    const po = await this.repo.findForDetail(orgId, purchaseOrderId);
    if (!po) {
      throw new NotFoundException("Purchase order not found");
    }
    return this.formatDetail(po);
  }

  async createPurchaseOrder(
    orgId?: string,
    actorUserId?: string,
    input?: PurchaseOrderCreateInput,
    idempotencyKey?: string,
  ) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const createKey = buildIdempotencyKey(idempotencyKey, {
      scope: "purchase-orders.create",
      actorUserId,
    });
    const requestHash = createKey ? hashRequestBody(input) : null;
    if (createKey) {
      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { orgId_key: { orgId, key: createKey } },
      });
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictException("Idempotency key already used with different payload");
        }
        return existing.response as unknown as object;
      }
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: { orgSettings: true },
    });
    if (!org) {
      throw new NotFoundException("Organization not found");
    }

    const vendor = await this.prisma.vendor.findFirst({ where: { id: input.vendorId, orgId } });
    if (!vendor) {
      throw new NotFoundException("Vendor not found");
    }
    if (!vendor.isActive) {
      throw new BadRequestException("Vendor must be active");
    }

    const refs = await this.resolveLineRefs(orgId, input.lines, org.vatEnabled);
    const calculated = calculateBillLines({
      lines: input.lines.map((line) => ({
        ...line,
        taxCodeId: line.taxCodeId ?? refs.itemsById.get(line.itemId ?? "")?.defaultTaxCodeId ?? undefined,
      })),
      itemsById: refs.itemsById,
      taxCodesById: refs.taxCodesById,
      vatEnabled: org.vatEnabled,
      vatBehavior: org.orgSettings?.defaultVatBehavior ?? "EXCLUSIVE",
    });

    const po = await this.repo.create({
      orgId,
      vendorId: vendor.id,
      poNumber: input.poNumber,
      systemNumber: this.generateSystemNumber(),
      status: "DRAFT",
      poDate: new Date(input.poDate),
      expectedDeliveryDate: input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : undefined,
      currency: input.currency ?? org.baseCurrency ?? "AED",
      exchangeRate: input.exchangeRate ?? 1,
      subTotal: calculated.subTotal,
      taxTotal: calculated.taxTotal,
      total: calculated.total,
      billedAmount: 0,
      reference: input.reference,
      notes: input.notes,
      createdByUserId: actorUserId,
      lines: {
        createMany: {
          data: calculated.lines.map((line) => ({
            lineNo: line.lineNo,
            expenseAccountId: line.expenseAccountId,
            itemId: line.itemId,
            unitOfMeasureId: line.unitOfMeasureId,
            description: line.description,
            qtyOrdered: line.qty,
            qtyReceived: 0,
            qtyBilled: 0,
            unitPrice: line.unitPrice,
            discountAmount: line.discountAmount,
            taxCodeId: line.taxCodeId,
            lineSubTotal: line.lineSubTotal,
            lineTax: line.lineTax,
            lineTotal: line.lineTotal,
          })),
        },
      },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "PURCHASE_ORDER",
      entityId: po.id,
      action: AuditAction.CREATE,
      after: po,
    });

    const response = this.formatDetail(po);
    if (createKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: createKey,
          requestHash,
          response: response as unknown as object,
          statusCode: 201,
        },
      });
    }
    return response;
  }

  async updatePurchaseOrder(orgId?: string, purchaseOrderId?: string, actorUserId?: string, input?: PurchaseOrderUpdateInput) {
    if (!orgId || !purchaseOrderId) {
      throw new NotFoundException("Purchase order not found");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await this.repo.findForUpdate(orgId, purchaseOrderId, tx);
      if (!existing) {
        throw new NotFoundException("Purchase order not found");
      }
      if (existing.status === "CLOSED" || existing.status === "CANCELLED") {
        throw new ConflictException("Closed or cancelled purchase orders cannot be edited");
      }
      if (this.isCurrencyLocked(existing.status)) {
        const nextCurrency = input.currency ?? existing.currency;
        const nextRate = input.exchangeRate ?? Number(existing.exchangeRate ?? 1);
        if (nextCurrency !== existing.currency || !dec(nextRate).equals(existing.exchangeRate ?? 1)) {
          throw new ConflictException("Currency and exchange rate cannot be changed after sending a purchase order");
        }
      }
      if (
        input.lines &&
        existing.lines.some((line) => dec(line.qtyReceived).greaterThan(0) || dec(line.qtyBilled).greaterThan(0))
      ) {
        throw new ConflictException("Cannot replace lines after receiving or billing");
      }

      const org = await tx.organization.findUnique({
        where: { id: orgId },
        include: { orgSettings: true },
      });
      if (!org) {
        throw new NotFoundException("Organization not found");
      }

      const vendorId = input.vendorId ?? existing.vendorId;
      const vendor = await tx.vendor.findFirst({ where: { id: vendorId, orgId } });
      if (!vendor || !vendor.isActive) {
        throw new BadRequestException("Vendor must be active");
      }

      let totals = {
        subTotal: existing.subTotal,
        taxTotal: existing.taxTotal,
        total: existing.total,
      };

      if (input.lines) {
        const refs = await this.resolveLineRefs(orgId, input.lines, org.vatEnabled, tx);
        const calculated = calculateBillLines({
          lines: input.lines.map((line) => ({
            ...line,
            taxCodeId: line.taxCodeId ?? refs.itemsById.get(line.itemId ?? "")?.defaultTaxCodeId ?? undefined,
          })),
          itemsById: refs.itemsById,
          taxCodesById: refs.taxCodesById,
          vatEnabled: org.vatEnabled,
          vatBehavior: org.orgSettings?.defaultVatBehavior ?? "EXCLUSIVE",
        });
        totals = { subTotal: calculated.subTotal, taxTotal: calculated.taxTotal, total: calculated.total };
        await this.repo.deleteLines(purchaseOrderId, tx);
        await this.repo.createLines(
          calculated.lines.map((line) => ({
            purchaseOrderId,
            lineNo: line.lineNo,
            expenseAccountId: line.expenseAccountId,
            itemId: line.itemId,
            unitOfMeasureId: line.unitOfMeasureId,
            description: line.description,
            qtyOrdered: line.qty,
            qtyReceived: 0,
            qtyBilled: 0,
            unitPrice: line.unitPrice,
            discountAmount: line.discountAmount,
            taxCodeId: line.taxCodeId,
            lineSubTotal: line.lineSubTotal,
            lineTax: line.lineTax,
            lineTotal: line.lineTotal,
          })),
          tx,
        );
      }

      await this.repo.update(
        purchaseOrderId,
        {
          vendorId,
          poNumber: input.poNumber ?? existing.poNumber,
          poDate: input.poDate ? new Date(input.poDate) : existing.poDate,
          expectedDeliveryDate:
            input.expectedDeliveryDate !== undefined
              ? (input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : null)
              : existing.expectedDeliveryDate,
          currency: input.currency ?? existing.currency,
          exchangeRate: input.exchangeRate ?? existing.exchangeRate ?? 1,
          reference: input.reference ?? existing.reference,
          notes: input.notes ?? existing.notes,
          subTotal: totals.subTotal,
          taxTotal: totals.taxTotal,
          total: totals.total,
        },
        tx,
      );

      const after = await this.repo.findForDetail(orgId, purchaseOrderId, tx);
      if (!after) {
        throw new NotFoundException("Purchase order not found");
      }
      return { before: existing, after };
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "PURCHASE_ORDER",
      entityId: purchaseOrderId,
      action: AuditAction.UPDATE,
      before: result.before,
      after: result.after,
    });
    return this.formatDetail(result.after);
  }

  async sendPurchaseOrder(orgId?: string, purchaseOrderId?: string, actorUserId?: string) {
    if (!orgId || !purchaseOrderId) {
      throw new NotFoundException("Purchase order not found");
    }

    const po = await this.repo.findForDetail(orgId, purchaseOrderId);
    if (!po) {
      throw new NotFoundException("Purchase order not found");
    }
    if (!po.vendor.email) {
      throw new BadRequestException("Vendor email is required to send purchase order");
    }
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        name: true,
        orgSettings: {
          select: {
            purchaseOrderApprovalThreshold: true,
          },
        },
      },
    });
    const approvalRequired = this.requiresApproval(po.total, org?.orgSettings?.purchaseOrderApprovalThreshold ?? null);
    this.ensureCanSend(po.status, approvalRequired);

    const poNumber = po.systemNumber ?? po.poNumber ?? `PO-${po.id.slice(0, 8)}`;
    const pdf = buildPurchaseOrderPdf({
      orgName: org?.name ?? null,
      poNumber,
      poDate: po.poDate,
      expectedDeliveryDate: po.expectedDeliveryDate,
      vendorName: po.vendor.name,
      vendorEmail: po.vendor.email,
      currency: po.currency,
      subTotal: po.subTotal.toString(),
      taxTotal: po.taxTotal.toString(),
      total: po.total.toString(),
      reference: po.reference,
      notes: po.notes,
      lines: po.lines.map((line) => ({
        description: line.description,
        qtyOrdered: line.qtyOrdered.toString(),
        unitPrice: line.unitPrice.toString(),
        lineTotal: line.lineTotal.toString(),
      })),
    });

    await this.mailer.sendPurchaseOrderEmail(po.vendor.email, {
      orgName: org?.name ?? null,
      vendorName: po.vendor.name,
      poNumber,
      poDate: po.poDate,
      expectedDeliveryDate: po.expectedDeliveryDate,
      total: po.total.toFixed(2),
      currency: po.currency,
      pdfFileName: `${poNumber}.pdf`,
      pdfContent: pdf,
    });

    return this.formatDetail(await this.transitionStatus(orgId, purchaseOrderId, actorUserId, "SENT", { sentAt: new Date() }));
  }

  async requestApproval(orgId?: string, purchaseOrderId?: string, actorUserId?: string) {
    if (!orgId || !purchaseOrderId) {
      throw new NotFoundException("Purchase order not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const po = await this.repo.findForDetail(orgId, purchaseOrderId, tx);
      if (!po) {
        throw new NotFoundException("Purchase order not found");
      }
      if (po.status === "CANCELLED" || po.status === "CLOSED") {
        throw new ConflictException("Closed or cancelled purchase orders cannot request approval");
      }
      if (po.status !== "DRAFT") {
        throw new ConflictException("Only draft purchase orders can be submitted for approval");
      }

      const org = await tx.organization.findUnique({
        where: { id: orgId },
        select: {
          orgSettings: {
            select: {
              purchaseOrderApprovalThreshold: true,
            },
          },
        },
      });
      if (!org) {
        throw new NotFoundException("Organization not found");
      }
      const approvalRequired = this.requiresApproval(po.total, org.orgSettings?.purchaseOrderApprovalThreshold ?? null);
      if (!approvalRequired) {
        throw new BadRequestException("Approval threshold is not configured or this purchase order is below threshold");
      }

      await this.repo.update(purchaseOrderId, { status: "PENDING_APPROVAL" }, tx);
      const after = await this.repo.findForDetail(orgId, purchaseOrderId, tx);
      if (!after) {
        throw new NotFoundException("Purchase order not found");
      }
      return { before: po, after };
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "PURCHASE_ORDER",
      entityId: purchaseOrderId,
      action: AuditAction.UPDATE,
      before: { status: updated.before.status },
      after: { status: updated.after.status, event: "REQUEST_APPROVAL" },
    });

    return this.formatDetail(updated.after);
  }

  async approvePurchaseOrder(orgId?: string, purchaseOrderId?: string, actorUserId?: string) {
    if (!orgId || !purchaseOrderId) {
      throw new NotFoundException("Purchase order not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const po = await this.repo.findForDetail(orgId, purchaseOrderId, tx);
      if (!po) {
        throw new NotFoundException("Purchase order not found");
      }
      if (po.status !== "PENDING_APPROVAL") {
        throw new ConflictException("Only purchase orders pending approval can be approved");
      }

      await this.repo.update(purchaseOrderId, { status: "APPROVED" }, tx);
      const after = await this.repo.findForDetail(orgId, purchaseOrderId, tx);
      if (!after) {
        throw new NotFoundException("Purchase order not found");
      }
      return { before: po, after };
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "PURCHASE_ORDER",
      entityId: purchaseOrderId,
      action: AuditAction.UPDATE,
      before: { status: updated.before.status },
      after: { status: updated.after.status, event: "APPROVE" },
    });

    return this.formatDetail(updated.after);
  }

  async rejectPurchaseOrder(
    orgId?: string,
    purchaseOrderId?: string,
    actorUserId?: string,
    input?: PurchaseOrderRejectInput,
  ) {
    if (!orgId || !purchaseOrderId) {
      throw new NotFoundException("Purchase order not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const po = await this.repo.findForDetail(orgId, purchaseOrderId, tx);
      if (!po) {
        throw new NotFoundException("Purchase order not found");
      }
      if (po.status !== "PENDING_APPROVAL") {
        throw new ConflictException("Only purchase orders pending approval can be rejected");
      }

      await this.repo.update(purchaseOrderId, { status: "DRAFT" }, tx);
      const after = await this.repo.findForDetail(orgId, purchaseOrderId, tx);
      if (!after) {
        throw new NotFoundException("Purchase order not found");
      }
      return { before: po, after };
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "PURCHASE_ORDER",
      entityId: purchaseOrderId,
      action: AuditAction.UPDATE,
      before: { status: updated.before.status },
      after: { status: updated.after.status, event: "REJECT", reason: input?.reason ?? null },
    });

    return this.formatDetail(updated.after);
  }

  async closePurchaseOrder(orgId?: string, purchaseOrderId?: string, actorUserId?: string) {
    return this.formatDetail(await this.transitionStatus(orgId, purchaseOrderId, actorUserId, "CLOSED", { closedAt: new Date() }));
  }

  async cancelPurchaseOrder(orgId?: string, purchaseOrderId?: string, actorUserId?: string) {
    if (!orgId || !purchaseOrderId) {
      throw new NotFoundException("Purchase order not found");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const po = await this.repo.findForDetail(orgId, purchaseOrderId, tx);
      if (!po) {
        throw new NotFoundException("Purchase order not found");
      }
      if (po.status === "CLOSED") {
        throw new ConflictException("Closed purchase order cannot be cancelled");
      }
      if (dec(po.billedAmount).greaterThan(0)) {
        throw new ConflictException("Purchase order with converted bills cannot be cancelled");
      }
      if (po.status !== "CANCELLED") {
        await this.repo.update(purchaseOrderId, { status: "CANCELLED", cancelledAt: new Date() }, tx);
      }
      const after = await this.repo.findForDetail(orgId, purchaseOrderId, tx);
      if (!after) {
        throw new NotFoundException("Purchase order not found");
      }
      return after;
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "PURCHASE_ORDER",
      entityId: purchaseOrderId,
      action: AuditAction.UPDATE,
      after: { status: updated.status },
    });
    return this.formatDetail(updated);
  }

  async receivePurchaseOrder(
    orgId?: string,
    purchaseOrderId?: string,
    actorUserId?: string,
    input?: PurchaseOrderReceiveInput,
  ) {
    if (!orgId || !purchaseOrderId) {
      throw new NotFoundException("Purchase order not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const receiptDate = new Date(input.receiptDate);
    const updated = await this.prisma.$transaction(async (tx) => {
      const po = await this.repo.findForDetail(orgId, purchaseOrderId, tx);
      if (!po) {
        throw new NotFoundException("Purchase order not found");
      }
      if (po.status === "CANCELLED" || po.status === "CLOSED") {
        throw new ConflictException("Closed or cancelled purchase orders cannot receive items");
      }

      const org = await tx.organization.findUnique({
        where: { id: orgId },
        include: { orgSettings: true },
      });
      if (!org) {
        throw new NotFoundException("Organization not found");
      }
      const lockDate = org.orgSettings?.lockDate ?? null;
      if (isDateLocked(lockDate, receiptDate)) {
        await this.audit.log({
          orgId,
          actorUserId,
          entityType: "PURCHASE_ORDER",
          entityId: purchaseOrderId,
          action: AuditAction.UPDATE,
          before: { status: po.status },
          after: {
            blockedAction: "receive purchase order",
            docDate: receiptDate.toISOString(),
            lockDate: lockDate ? lockDate.toISOString() : null,
          },
        });
      }
      ensureNotLocked(lockDate, receiptDate, "receive purchase order");

      const linesById = new Map(po.lines.map((line) => [line.id, line]));
      const unitIds = Array.from(
        new Set(
          input.lines
            .map((row) => {
              const line = linesById.get(row.lineId);
              if (!line) {
                return null;
              }
              return line.unitOfMeasureId ?? line.item?.unitOfMeasureId ?? null;
            })
            .filter(Boolean),
        ),
      ) as string[];
      const units = unitIds.length
        ? await tx.unitOfMeasure.findMany({
            where: { orgId, id: { in: unitIds } },
            select: { id: true, baseUnitId: true, conversionRate: true },
          })
        : [];
      const unitsById = new Map(units.map((unit) => [unit.id, unit]));
      const movements: Prisma.InventoryMovementCreateManyInput[] = [];

      for (const row of input.lines) {
        const line = linesById.get(row.lineId);
        if (!line) {
          throw new BadRequestException("Receipt line does not belong to this purchase order");
        }
        const nextReceived = round2(dec(line.qtyReceived).add(row.qty));
        if (nextReceived.greaterThan(line.qtyOrdered)) {
          throw new BadRequestException("Received quantity cannot exceed ordered quantity");
        }
        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: { qtyReceived: nextReceived },
        });

        if (!line.itemId || !line.item || !line.item.trackInventory || line.item.type !== "INVENTORY") {
          continue;
        }

        const unitId = line.unitOfMeasureId ?? line.item.unitOfMeasureId ?? undefined;
        const unit = unitId ? unitsById.get(unitId) : undefined;
        const conversion = unit && unit.baseUnitId ? dec(unit.conversionRate ?? 1) : dec(1);
        const qtyBase = dec(row.qty).mul(conversion).toDecimalPlaces(4);
        if (qtyBase.equals(0)) {
          continue;
        }

        let unitCost: Prisma.Decimal | undefined;
        const orderedQtyBase = dec(line.qtyOrdered).mul(conversion).abs().toDecimalPlaces(4);
        if (!orderedQtyBase.equals(0)) {
          unitCost = dec(line.lineSubTotal).div(orderedQtyBase).toDecimalPlaces(6);
        }

        movements.push({
          orgId,
          itemId: line.itemId,
          quantity: qtyBase,
          unitCost,
          sourceType: InventorySourceType.PURCHASE_ORDER_RECEIPT,
          sourceId: po.id,
          sourceLineId: line.id,
          createdByUserId: actorUserId,
          effectiveAt: receiptDate,
        });
      }

      if (movements.length > 0) {
        await tx.inventoryMovement.createMany({ data: movements });
      }

      const refreshed = await this.repo.findForDetail(orgId, purchaseOrderId, tx);
      if (!refreshed) {
        throw new NotFoundException("Purchase order not found");
      }
      const hasAnyReceipt = refreshed.lines.some((line) => dec(line.qtyReceived).greaterThan(0));
      const fullyReceived = refreshed.lines.length > 0 && refreshed.lines.every((line) => dec(line.qtyReceived).gte(line.qtyOrdered));
      const nextStatus =
        fullyReceived ? "RECEIVED" : hasAnyReceipt ? "PARTIALLY_RECEIVED" : refreshed.status;
      if (nextStatus !== refreshed.status) {
        await tx.purchaseOrder.update({
          where: { id: refreshed.id },
          data: {
            status: nextStatus,
            receivedAt: nextStatus === "RECEIVED" ? receiptDate : refreshed.receivedAt,
          },
        });
      }

      const after = await this.repo.findForDetail(orgId, purchaseOrderId, tx);
      if (!after) {
        throw new NotFoundException("Purchase order not found");
      }
      return after;
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "PURCHASE_ORDER",
      entityId: purchaseOrderId,
      action: AuditAction.UPDATE,
      after: { status: updated.status, receivedAt: updated.receivedAt },
    });
    return this.formatDetail(updated);
  }

  async convertToBill(
    orgId?: string,
    purchaseOrderId?: string,
    actorUserId?: string,
    input?: PurchaseOrderConvertInput,
    idempotencyKey?: string,
  ) {
    if (!orgId || !purchaseOrderId) {
      throw new NotFoundException("Purchase order not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const convertKey = buildIdempotencyKey(idempotencyKey, {
      scope: "purchase-orders.convert-to-bill",
      actorUserId,
    });
    const requestHash = convertKey ? hashRequestBody({ purchaseOrderId, input }) : null;
    if (convertKey) {
      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { orgId_key: { orgId, key: convertKey } },
      });
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictException("Idempotency key already used with different payload");
        }
        return existing.response as unknown as object;
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const po = await this.repo.findForDetail(orgId, purchaseOrderId, tx);
      if (!po) {
        throw new NotFoundException("Purchase order not found");
      }
      if (po.status === "CANCELLED" || po.status === "CLOSED") {
        throw new ConflictException("Closed or cancelled purchase orders cannot be converted");
      }

      const org = await tx.organization.findUnique({
        where: { id: orgId },
        include: { orgSettings: true },
      });
      if (!org) {
        throw new NotFoundException("Organization not found");
      }
      const billDate = new Date(input.billDate);
      ensureNotLocked(org.orgSettings?.lockDate ?? null, billDate, "convert purchase order to bill");

      const selectedLineIds = input.lineIds ? new Set(input.lineIds) : null;
      const basis = input.basis ?? "RECEIVED";

      const conversionRows: Array<{ line: PurchaseOrderDetail["lines"][number]; qty: Prisma.Decimal }> = [];
      for (const line of po.lines) {
        if (selectedLineIds && !selectedLineIds.has(line.id)) {
          continue;
        }
        const availableQty = basis === "RECEIVED" ? dec(line.qtyReceived).sub(line.qtyBilled) : dec(line.qtyOrdered).sub(line.qtyBilled);
        if (availableQty.greaterThan(0)) {
          conversionRows.push({ line, qty: availableQty });
        }
      }
      if (conversionRows.length === 0) {
        throw new BadRequestException("No remaining quantity available to convert");
      }

      const conversionLines = conversionRows.map((row) => ({
        expenseAccountId: row.line.expenseAccountId,
        itemId: row.line.itemId ?? undefined,
        unitOfMeasureId: row.line.unitOfMeasureId ?? undefined,
        description: row.line.description,
        qty: row.qty,
        unitPrice: row.line.unitPrice,
        discountAmount: dec(row.line.qtyOrdered).equals(0)
          ? dec(0)
          : dec(row.line.discountAmount).mul(row.qty).div(row.line.qtyOrdered).toDecimalPlaces(2),
        taxCodeId: row.line.taxCodeId ?? undefined,
      }));

      const refs = await this.resolveLineRefs(orgId, conversionLines, org.vatEnabled, tx);
      const calculated = calculateBillLines({
        lines: conversionLines.map((line) => ({
          ...line,
          taxCodeId: line.taxCodeId ?? refs.itemsById.get(line.itemId ?? "")?.defaultTaxCodeId ?? undefined,
        })),
        itemsById: refs.itemsById,
        taxCodesById: refs.taxCodesById,
        vatEnabled: org.vatEnabled,
        vatBehavior: org.orgSettings?.defaultVatBehavior ?? "EXCLUSIVE",
      });

      const dueDate = input.dueDate
        ? new Date(input.dueDate)
        : this.addDays(billDate, po.vendor.paymentTermsDays ?? 0);
      if (dueDate < billDate) {
        throw new BadRequestException("Due date cannot be before bill date");
      }

      const bill = await tx.bill.create({
        data: {
          orgId,
          vendorId: po.vendorId,
          purchaseOrderId: po.id,
          status: "DRAFT",
          billDate,
          dueDate,
          currency: po.currency,
          exchangeRate: po.exchangeRate ?? 1,
          billNumber: input.billNumber,
          reference: input.reference ?? po.reference,
          notes: input.notes ?? po.notes,
          subTotal: calculated.subTotal,
          taxTotal: calculated.taxTotal,
          total: calculated.total,
          createdByUserId: actorUserId,
          lines: {
            createMany: {
              data: calculated.lines.map((line, index) => ({
                lineNo: line.lineNo,
                purchaseOrderLineId: conversionRows[index].line.id,
                expenseAccountId: line.expenseAccountId,
                itemId: line.itemId,
                unitOfMeasureId: line.unitOfMeasureId,
                description: line.description,
                qty: line.qty,
                unitPrice: line.unitPrice,
                discountAmount: line.discountAmount,
                taxCodeId: line.taxCodeId,
                lineSubTotal: line.lineSubTotal,
                lineTax: line.lineTax,
                lineTotal: line.lineTotal,
              })),
            },
          },
        },
        include: { vendor: true, lines: true },
      });

      for (const row of conversionRows) {
        await tx.purchaseOrderLine.update({
          where: { id: row.line.id },
          data: { qtyBilled: round2(dec(row.line.qtyBilled).add(row.qty)) },
        });
      }
      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: { billedAmount: round2(dec(po.billedAmount).add(bill.total)) },
      });

      const updatedPo = await this.repo.findForDetail(orgId, purchaseOrderId, tx);
      if (!updatedPo) {
        throw new NotFoundException("Purchase order not found");
      }

      await tx.auditLog.create({
        data: {
          orgId,
          actorUserId,
          entityType: "PURCHASE_ORDER",
          entityId: po.id,
          action: AuditAction.UPDATE,
          before: { billedAmount: po.billedAmount, status: po.status },
          after: { billedAmount: updatedPo.billedAmount, convertedBillId: bill.id, basis },
          requestId: RequestContext.get()?.requestId,
          ip: RequestContext.get()?.ip,
          userAgent: RequestContext.get()?.userAgent,
        },
      });

      return { purchaseOrder: this.formatDetail(updatedPo), bill };
    });

    if (convertKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: convertKey,
          requestHash,
          response: result as unknown as object,
          statusCode: 201,
        },
      });
    }
    return result;
  }

  private async transitionStatus(
    orgId?: string,
    purchaseOrderId?: string,
    actorUserId?: string,
    status?: PurchaseOrderStatus,
    extraData?: Prisma.PurchaseOrderUpdateInput,
  ) {
    if (!orgId || !purchaseOrderId || !status) {
      throw new NotFoundException("Purchase order not found");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const po = await this.repo.findForDetail(orgId, purchaseOrderId, tx);
      if (!po) {
        throw new NotFoundException("Purchase order not found");
      }
      if (po.status === "CANCELLED" || po.status === "CLOSED") {
        throw new ConflictException("Closed or cancelled purchase orders cannot be updated");
      }
      if (status === "SENT" && po.status !== "DRAFT" && po.status !== "APPROVED") {
        throw new ConflictException("Only draft or approved purchase orders can be sent");
      }
      await this.repo.update(purchaseOrderId, { status, ...extraData }, tx);
      const after = await this.repo.findForDetail(orgId, purchaseOrderId, tx);
      if (!after) {
        throw new NotFoundException("Purchase order not found");
      }
      return after;
    });
    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "PURCHASE_ORDER",
      entityId: purchaseOrderId,
      action: AuditAction.UPDATE,
      after: { status: updated.status },
    });
    return updated;
  }

  private requiresApproval(total: Prisma.Decimal, threshold: Prisma.Decimal | null | undefined) {
    if (!threshold) {
      return false;
    }
    const thresholdValue = dec(threshold);
    if (!thresholdValue.greaterThan(0)) {
      return false;
    }
    return dec(total).greaterThanOrEqualTo(thresholdValue);
  }

  private ensureCanSend(status: PurchaseOrderStatus, approvalRequired: boolean) {
    if (approvalRequired && status === "DRAFT") {
      throw new ConflictException("Purchase order requires approval before sending");
    }
    if (approvalRequired && status === "PENDING_APPROVAL") {
      throw new ConflictException("Purchase order is pending approval");
    }
    if (approvalRequired && status !== "APPROVED") {
      throw new ConflictException("Only approved purchase orders can be sent");
    }
    if (!approvalRequired && status !== "DRAFT" && status !== "APPROVED") {
      throw new ConflictException("Only draft or approved purchase orders can be sent");
    }
  }

  private isCurrencyLocked(status: PurchaseOrderStatus) {
    return ["SENT", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED", "CANCELLED"].includes(status);
  }

  private async resolveLineRefs(
    orgId: string,
    lines: Array<{
      expenseAccountId: string;
      itemId?: string;
      taxCodeId?: string;
    }>,
    vatEnabled: boolean,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const itemIds = Array.from(new Set(lines.map((line) => line.itemId).filter(Boolean))) as string[];
    const taxCodeIds = Array.from(new Set(lines.map((line) => line.taxCodeId).filter(Boolean))) as string[];
    const accountIds = Array.from(new Set(lines.map((line) => line.expenseAccountId).filter(Boolean)));

    const accounts = accountIds.length
      ? await client.account.findMany({
          where: { orgId, id: { in: accountIds }, isActive: true },
          select: { id: true },
        })
      : [];
    if (accounts.length !== accountIds.length) {
      throw new BadRequestException("Expense account is missing or inactive");
    }

    const items = itemIds.length
      ? await client.item.findMany({
          where: { orgId, id: { in: itemIds }, isActive: true },
          select: { id: true, defaultTaxCodeId: true },
        })
      : [];
    if (items.length !== itemIds.length) {
      throw new NotFoundException("Item not found");
    }

    const defaultTaxIds = items
      .map((item) => item.defaultTaxCodeId)
      .filter((id): id is string => Boolean(id));
    const allTaxIds = Array.from(new Set([...taxCodeIds, ...defaultTaxIds]));
    if (allTaxIds.length > 0 && !vatEnabled) {
      throw new BadRequestException("VAT is disabled for this organization");
    }

    const taxCodes = allTaxIds.length
      ? await client.taxCode.findMany({
          where: { orgId, id: { in: allTaxIds }, isActive: true },
          select: { id: true, rate: true, type: true },
        })
      : [];
    if (taxCodes.length !== allTaxIds.length) {
      throw new NotFoundException("Tax code not found");
    }

    return {
      itemsById: new Map(items.map((item) => [item.id, item])),
      taxCodesById: new Map(taxCodes.map((tax) => [tax.id, { ...tax, rate: Number(tax.rate), isActive: true }])),
    };
  }

  private formatDetail(po: PurchaseOrderDetail) {
    return {
      ...po,
      remainingAmount: round2(dec(po.total).sub(po.billedAmount)),
      lines: po.lines.map((line) => ({
        ...line,
        remainingToReceiveQty: round2(dec(line.qtyOrdered).sub(line.qtyReceived)),
        remainingToBillQty: round2(dec(line.qtyOrdered).sub(line.qtyBilled)),
      })),
    };
  }

  private addDays(date: Date, days: number) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private generateSystemNumber() {
    const stamp = Date.now();
    const suffix = Math.floor(Math.random() * 900 + 100);
    return `PO-${stamp}-${suffix}`;
  }
}
