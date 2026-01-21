import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "./prisma/prisma.service";
import { AuditService } from "./common/audit.service";
import { hashRequestBody } from "./common/idempotency";
import { buildBillPostingLines, calculateBillLines } from "./bills.utils";
import { dec, eq, gt } from "./common/money";
import { type BillCreateInput, type BillLineCreateInput, type BillUpdateInput } from "@ledgerlite/shared";
import { RequestContext } from "./logging/request-context";

type BillRecord = Prisma.BillGetPayload<{
  include: {
    vendor: true;
    lines: { include: { item: true; taxCode: true; expenseAccount: true } };
  };
}>;

@Injectable()
export class BillsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listBills(orgId?: string, search?: string, status?: string) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    const where: Prisma.BillWhereInput = { orgId };
    if (status) {
      const normalized = status.toUpperCase();
      if (["DRAFT", "POSTED", "VOID"].includes(normalized)) {
        where.status = normalized as any;
      }
    }
    if (search) {
      where.OR = [
        { systemNumber: { contains: search, mode: "insensitive" } },
        { billNumber: { contains: search, mode: "insensitive" } },
        { vendor: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    return this.prisma.bill.findMany({
      where,
      include: { vendor: true },
      orderBy: { billDate: "desc" },
    });
  }

  async getBill(orgId?: string, billId?: string) {
    if (!orgId || !billId) {
      throw new NotFoundException("Bill not found");
    }

    const bill = await this.prisma.bill.findFirst({
      where: { id: billId, orgId },
      include: {
        vendor: true,
        lines: { include: { item: true, taxCode: true, expenseAccount: true }, orderBy: { lineNo: "asc" } },
      },
    });
    if (!bill) {
      throw new NotFoundException("Bill not found");
    }
    return bill;
  }

  async createBill(orgId?: string, actorUserId?: string, input?: BillCreateInput, idempotencyKey?: string) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const requestHash = idempotencyKey ? hashRequestBody(input) : null;
    if (idempotencyKey) {
      const existingKey = await this.prisma.idempotencyKey.findUnique({
        where: { orgId_key: { orgId, key: idempotencyKey } },
      });
      if (existingKey) {
        if (existingKey.requestHash !== requestHash) {
          throw new ConflictException("Idempotency key already used with different payload");
        }
        return existingKey.response as unknown as BillRecord;
      }
    }

    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundException("Organization not found");
    }

    const vendor = await this.prisma.vendor.findFirst({
      where: { id: input.vendorId, orgId },
    });
    if (!vendor) {
      throw new NotFoundException("Vendor not found");
    }
    if (!vendor.isActive) {
      throw new BadRequestException("Vendor must be active");
    }

    const { itemsById, taxCodesById, expenseAccountsById } = await this.resolveBillRefs(
      orgId,
      input.lines,
      org.vatEnabled,
    );

    let calculated;
    try {
      calculated = calculateBillLines({
        lines: input.lines,
        itemsById,
        taxCodesById,
        vatEnabled: org.vatEnabled,
      });
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : "Invalid bill lines");
    }

    for (const line of calculated.lines) {
      if (!expenseAccountsById.has(line.expenseAccountId)) {
        throw new BadRequestException("Expense account is missing or inactive");
      }
    }

    const billDate = new Date(input.billDate);
    const dueDate = input.dueDate ? new Date(input.dueDate) : this.addDays(billDate, vendor.paymentTermsDays ?? 0);
    if (dueDate < billDate) {
      throw new BadRequestException("Due date cannot be before bill date");
    }

    const currency = input.currency ?? org.baseCurrency;
    if (!currency) {
      throw new BadRequestException("Currency is required");
    }

    const bill = await this.prisma.bill.create({
      data: {
        orgId,
        vendorId: vendor.id,
        status: "DRAFT",
        billDate,
        dueDate,
        currency,
        exchangeRate: input.exchangeRate,
        billNumber: input.billNumber,
        subTotal: calculated.subTotal,
        taxTotal: calculated.taxTotal,
        total: calculated.total,
        notes: input.notes,
        createdByUserId: actorUserId,
        lines: {
          createMany: {
            data: calculated.lines.map((line) => ({
              lineNo: line.lineNo,
              expenseAccountId: line.expenseAccountId,
              itemId: line.itemId,
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
      include: {
        vendor: true,
        lines: { include: { item: true, taxCode: true, expenseAccount: true }, orderBy: { lineNo: "asc" } },
      },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "BILL",
      entityId: bill.id,
      action: AuditAction.CREATE,
      after: bill,
    });

    if (idempotencyKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: idempotencyKey,
          requestHash,
          response: bill as unknown as object,
          statusCode: 201,
        },
      });
    }

    return bill;
  }

  async updateBill(orgId?: string, billId?: string, actorUserId?: string, input?: BillUpdateInput) {
    if (!orgId || !billId) {
      throw new NotFoundException("Bill not found");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.bill.findFirst({
        where: { id: billId, orgId },
        include: { lines: true },
      });
      if (!existing) {
        throw new NotFoundException("Bill not found");
      }
      if (existing.status !== "DRAFT") {
        throw new ConflictException("Posted bills cannot be edited");
      }

      const org = await tx.organization.findUnique({ where: { id: orgId } });
      if (!org) {
        throw new NotFoundException("Organization not found");
      }

      const vendorId = input.vendorId ?? existing.vendorId;
      const vendor = await tx.vendor.findFirst({ where: { id: vendorId, orgId } });
      if (!vendor) {
        throw new NotFoundException("Vendor not found");
      }
      if (!vendor.isActive) {
        throw new BadRequestException("Vendor must be active");
      }

      const billDate = input.billDate ? new Date(input.billDate) : existing.billDate;
      const dueDate = input.dueDate
        ? new Date(input.dueDate)
        : input.billDate
          ? this.addDays(billDate, vendor.paymentTermsDays ?? 0)
          : existing.dueDate;
      if (dueDate < billDate) {
        throw new BadRequestException("Due date cannot be before bill date");
      }

      const currency = input.currency ?? existing.currency ?? org.baseCurrency;
      if (!currency) {
        throw new BadRequestException("Currency is required");
      }

      let totals = {
        subTotal: dec(existing.subTotal),
        taxTotal: dec(existing.taxTotal),
        total: dec(existing.total),
      };

      if (input.lines) {
        const { itemsById, taxCodesById, expenseAccountsById } = await this.resolveBillRefs(
          orgId,
          input.lines,
          org.vatEnabled,
          tx,
        );
        let calculated;
        try {
          calculated = calculateBillLines({
            lines: input.lines,
            itemsById,
            taxCodesById,
            vatEnabled: org.vatEnabled,
          });
        } catch (err) {
          throw new BadRequestException(err instanceof Error ? err.message : "Invalid bill lines");
        }

        for (const line of calculated.lines) {
          if (!expenseAccountsById.has(line.expenseAccountId)) {
            throw new BadRequestException("Expense account is missing or inactive");
          }
        }

        totals = calculated;

        await tx.billLine.deleteMany({ where: { billId } });
        await tx.billLine.createMany({
          data: calculated.lines.map((line) => ({
            billId,
            lineNo: line.lineNo,
            expenseAccountId: line.expenseAccountId,
            itemId: line.itemId,
            description: line.description,
            qty: line.qty,
            unitPrice: line.unitPrice,
            discountAmount: line.discountAmount,
            taxCodeId: line.taxCodeId,
            lineSubTotal: line.lineSubTotal,
            lineTax: line.lineTax,
            lineTotal: line.lineTotal,
          })),
        });
      }

      const updated = await tx.bill.update({
        where: { id: billId },
        data: {
          vendorId,
          billDate,
          dueDate,
          currency,
          exchangeRate: input.exchangeRate ?? existing.exchangeRate,
          billNumber: input.billNumber ?? existing.billNumber,
          notes: input.notes ?? existing.notes,
          subTotal: totals.subTotal,
          taxTotal: totals.taxTotal,
          total: totals.total,
        },
      });

      const after = await tx.bill.findFirst({
        where: { id: billId, orgId },
        include: {
          vendor: true,
          lines: { include: { item: true, taxCode: true, expenseAccount: true }, orderBy: { lineNo: "asc" } },
        },
      });

      return { before: existing, after: after ?? updated };
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "BILL",
      entityId: billId,
      action: AuditAction.UPDATE,
      before: result.before,
      after: result.after,
    });

    return result.after;
  }

  async postBill(orgId?: string, billId?: string, actorUserId?: string, idempotencyKey?: string) {
    if (!orgId || !billId) {
      throw new NotFoundException("Bill not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }

    const requestHash = idempotencyKey ? hashRequestBody({ billId }) : null;
    if (idempotencyKey) {
      const existingKey = await this.prisma.idempotencyKey.findUnique({
        where: { orgId_key: { orgId, key: idempotencyKey } },
      });
      if (existingKey) {
        if (existingKey.requestHash !== requestHash) {
          throw new ConflictException("Idempotency key already used with different payload");
        }
        return existingKey.response as unknown as object;
      }
    }

    let result: { bill: object; glHeader: object };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const bill = await tx.bill.findFirst({
          where: { id: billId, orgId },
          include: { lines: true, vendor: true },
        });
        if (!bill) {
          throw new NotFoundException("Bill not found");
        }
        if (bill.status !== "DRAFT") {
          throw new ConflictException("Bill is already posted");
        }

        const org = await tx.organization.findUnique({
          where: { id: orgId },
          include: { orgSettings: true },
        });
        if (!org) {
          throw new NotFoundException("Organization not found");
        }

        if (!org.vatEnabled && gt(bill.taxTotal, 0)) {
          throw new BadRequestException("VAT is disabled for this organization");
        }

        const apAccount = await tx.account.findFirst({
          where: { orgId, subtype: "AP", isActive: true },
        });
        if (!apAccount) {
          throw new BadRequestException("Accounts Payable account is not configured");
        }

        let vatAccountId: string | undefined;
        if (org.vatEnabled && gt(bill.taxTotal, 0)) {
          const vatAccount = await tx.account.findFirst({
            where: { orgId, subtype: "VAT_RECEIVABLE", isActive: true },
          });
          if (!vatAccount) {
            throw new BadRequestException("VAT Receivable account is not configured");
          }
          vatAccountId = vatAccount.id;
        }

        const expenseAccountIds = Array.from(new Set(bill.lines.map((line) => line.expenseAccountId)));
        const expenseAccounts = expenseAccountIds.length
          ? await tx.account.findMany({ where: { orgId, id: { in: expenseAccountIds }, isActive: true } })
          : [];
        if (expenseAccounts.length !== expenseAccountIds.length) {
          throw new BadRequestException("Expense account is missing or inactive");
        }

        const numbering = await tx.orgSettings.upsert({
          where: { orgId },
          update: {
            billPrefix: org.orgSettings?.billPrefix ?? "BILL-",
            billNextNumber: { increment: 1 },
          },
          create: {
            orgId,
            invoicePrefix: org.orgSettings?.invoicePrefix ?? "INV-",
            invoiceNextNumber: org.orgSettings?.invoiceNextNumber ?? 1,
            billPrefix: "BILL-",
            billNextNumber: 2,
            paymentPrefix: org.orgSettings?.paymentPrefix ?? "PAY-",
            paymentNextNumber: org.orgSettings?.paymentNextNumber ?? 1,
          },
          select: { billPrefix: true, billNextNumber: true },
        });

        const nextNumber = Math.max(1, (numbering.billNextNumber ?? 1) - 1);
        const assignedNumber = `${numbering.billPrefix ?? "BILL-"}${nextNumber}`;

        let posting;
        try {
          posting = buildBillPostingLines({
            billNumber: bill.systemNumber ?? assignedNumber,
            vendorId: bill.vendorId,
            total: bill.total,
            lines: bill.lines.map((line) => ({
              expenseAccountId: line.expenseAccountId,
              lineSubTotal: line.lineSubTotal,
              lineTax: line.lineTax,
              taxCodeId: line.taxCodeId ?? undefined,
            })),
            apAccountId: apAccount.id,
            vatAccountId,
          });
        } catch (err) {
          throw new BadRequestException(err instanceof Error ? err.message : "Unable to post bill");
        }

        if (!eq(posting.totalDebit, posting.totalCredit)) {
          throw new BadRequestException("Bill posting is not balanced");
        }

        const updatedBill = await tx.bill.update({
          where: { id: billId },
          data: {
            status: "POSTED",
            systemNumber: bill.systemNumber ?? assignedNumber,
            postedAt: new Date(),
          },
        });

        const glHeader = await tx.gLHeader.create({
          data: {
            orgId,
            sourceType: "BILL",
            sourceId: bill.id,
            postingDate: updatedBill.postedAt ?? new Date(),
            currency: bill.currency,
            exchangeRate: bill.exchangeRate,
            totalDebit: posting.totalDebit,
            totalCredit: posting.totalCredit,
            status: "POSTED",
            createdByUserId: actorUserId,
            memo: `Bill ${updatedBill.systemNumber ?? assignedNumber}`,
            lines: {
              createMany: {
                data: posting.lines.map((line) => ({
                  lineNo: line.lineNo,
                  accountId: line.accountId,
                  debit: line.debit,
                  credit: line.credit,
                  description: line.description ?? undefined,
                  vendorId: line.vendorId ?? undefined,
                  taxCodeId: line.taxCodeId ?? undefined,
                })),
              },
            },
          },
          include: { lines: true },
        });

        await tx.auditLog.create({
          data: {
            orgId,
            actorUserId,
            entityType: "BILL",
            entityId: bill.id,
            action: AuditAction.POST,
            before: bill,
            after: updatedBill,
            requestId: RequestContext.get()?.requestId,
          },
        });

        const response = {
          bill: {
            ...updatedBill,
            vendor: bill.vendor,
            lines: bill.lines,
          },
          glHeader,
        };

        return response;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Bill is already posted");
      }
      throw err;
    }

    if (idempotencyKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: idempotencyKey,
          requestHash,
          response: result as unknown as object,
          statusCode: 201,
        },
      });
    }

    return result;
  }

  private async resolveBillRefs(
    orgId: string,
    lines: BillLineCreateInput[],
    vatEnabled: boolean,
    tx?: Prisma.TransactionClient,
  ) {
    const itemIds = Array.from(new Set(lines.map((line) => line.itemId).filter(Boolean))) as string[];
    const expenseAccountIds = Array.from(new Set(lines.map((line) => line.expenseAccountId).filter(Boolean))) as string[];
    const taxCodeIds = Array.from(new Set(lines.map((line) => line.taxCodeId).filter(Boolean))) as string[];
    const client = tx ?? this.prisma;

    const items = itemIds.length
      ? await client.item.findMany({
          where: { orgId, id: { in: itemIds } },
          select: { id: true, expenseAccountId: true, defaultTaxCodeId: true, isActive: true },
        })
      : [];
    if (items.length !== itemIds.length) {
      throw new NotFoundException("Item not found");
    }
    if (items.some((item) => !item.isActive)) {
      throw new BadRequestException("Item must be active");
    }

    const defaultTaxIds = items
      .map((item) => item.defaultTaxCodeId)
      .filter(Boolean) as string[];
    const allTaxIds = Array.from(new Set([...taxCodeIds, ...defaultTaxIds]));

    if (allTaxIds.length > 0 && !vatEnabled) {
      throw new BadRequestException("VAT is disabled for this organization");
    }

    const taxCodes = allTaxIds.length
      ? await client.taxCode.findMany({
          where: { orgId, id: { in: allTaxIds } },
          select: { id: true, rate: true, type: true, isActive: true },
        })
      : [];
    if (taxCodes.length !== allTaxIds.length) {
      throw new NotFoundException("Tax code not found");
    }
    if (taxCodes.some((tax) => !tax.isActive)) {
      throw new BadRequestException("Tax code must be active");
    }

    const expenseAccounts = expenseAccountIds.length
      ? await client.account.findMany({
          where: { orgId, id: { in: expenseAccountIds }, isActive: true },
          select: { id: true },
        })
      : [];

    return {
      itemsById: new Map(items.map((item) => [item.id, item])),
      taxCodesById: new Map(taxCodes.map((tax) => [tax.id, { ...tax, rate: Number(tax.rate) }])),
      expenseAccountsById: new Set(expenseAccounts.map((account) => account.id)),
    };
  }

  private addDays(date: Date, days: number) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
}
