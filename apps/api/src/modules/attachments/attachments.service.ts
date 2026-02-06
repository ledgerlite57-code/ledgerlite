import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { type AttachmentCreateInput } from "@ledgerlite/shared";

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listAttachments(orgId?: string, entityType?: string, entityId?: string) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    if (!entityType || !entityId) {
      throw new BadRequestException("Invalid attachment query");
    }

    const normalizedType = this.normalizeEntityType(entityType);
    await this.assertEntityExists(orgId, normalizedType, entityId);

    return this.prisma.attachment.findMany({
      where: { orgId, entityType: normalizedType, entityId },
      orderBy: { createdAt: "desc" },
    });
  }

  async createAttachment(orgId?: string, actorUserId?: string, input?: AttachmentCreateInput) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    if (!actorUserId) {
      throw new BadRequestException("Missing user context");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const entityType = this.normalizeEntityType(input.entityType);
    await this.assertEntityExists(orgId, entityType, input.entityId);

    const attachment = await this.prisma.attachment.create({
      data: {
        orgId,
        entityType,
        entityId: input.entityId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        storageKey: input.storageKey,
        description: input.description,
        uploadedByUserId: actorUserId,
      },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "ATTACHMENT",
      entityId: attachment.id,
      action: AuditAction.CREATE,
      after: attachment,
    });

    return attachment;
  }

  async deleteAttachment(orgId?: string, attachmentId?: string, actorUserId?: string) {
    if (!orgId || !attachmentId) {
      throw new NotFoundException("Attachment not found");
    }

    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, orgId },
    });
    if (!attachment) {
      throw new NotFoundException("Attachment not found");
    }

    await this.prisma.attachment.delete({ where: { id: attachmentId } });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "ATTACHMENT",
      entityId: attachmentId,
      action: AuditAction.DELETE,
      before: attachment,
    });

    return { id: attachmentId };
  }

  private normalizeEntityType(entityType: string) {
    return entityType.trim().toUpperCase();
  }

  private async assertEntityExists(orgId: string, entityType: string, entityId: string) {
    let exists = false;
    switch (entityType) {
      case "INVOICE":
        exists = Boolean(await this.prisma.invoice.findFirst({ where: { id: entityId, orgId } }));
        break;
      case "BILL":
        exists = Boolean(await this.prisma.bill.findFirst({ where: { id: entityId, orgId } }));
        break;
      case "CREDIT_NOTE":
        exists = Boolean(await this.prisma.creditNote.findFirst({ where: { id: entityId, orgId } }));
        break;
      case "DEBIT_NOTE":
        exists = Boolean(await this.prisma.debitNote.findFirst({ where: { id: entityId, orgId } }));
        break;
      case "PAYMENT_RECEIVED":
        exists = Boolean(await this.prisma.paymentReceived.findFirst({ where: { id: entityId, orgId } }));
        break;
      case "VENDOR_PAYMENT":
        exists = Boolean(await this.prisma.vendorPayment.findFirst({ where: { id: entityId, orgId } }));
        break;
      case "EXPENSE":
        exists = Boolean(await this.prisma.expense.findFirst({ where: { id: entityId, orgId } }));
        break;
      case "BANK_TRANSACTION":
        exists = Boolean(await this.prisma.bankTransaction.findFirst({ where: { id: entityId, orgId } }));
        break;
      case "CUSTOMER":
        exists = Boolean(await this.prisma.customer.findFirst({ where: { id: entityId, orgId } }));
        break;
      case "VENDOR":
        exists = Boolean(await this.prisma.vendor.findFirst({ where: { id: entityId, orgId } }));
        break;
      case "ITEM":
        exists = Boolean(await this.prisma.item.findFirst({ where: { id: entityId, orgId } }));
        break;
      case "ACCOUNT":
        exists = Boolean(await this.prisma.account.findFirst({ where: { id: entityId, orgId } }));
        break;
      case "JOURNAL":
        exists = Boolean(await this.prisma.journalEntry.findFirst({ where: { id: entityId, orgId } }));
        break;
      default:
        throw new BadRequestException("Unsupported attachment entity type");
    }

    if (!exists) {
      throw new NotFoundException("Attachment entity not found");
    }
  }
}
