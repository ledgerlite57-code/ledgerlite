import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { buildIdempotencyKey, hashRequestBody } from "../../common/idempotency";
import { type UnitOfMeasureCreateInput, type UnitOfMeasureUpdateInput } from "@ledgerlite/shared";

type UnitRecord = Prisma.UnitOfMeasureGetPayload<Prisma.UnitOfMeasureDefaultArgs>;

@Injectable()
export class UnitsOfMeasurementService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listUnits(orgId?: string, search?: string, isActive?: boolean) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    const where: Prisma.UnitOfMeasureWhereInput = { orgId };
    if (typeof isActive === "boolean") {
      where.isActive = isActive;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { symbol: { contains: search, mode: "insensitive" } },
      ];
    }

    return this.prisma.unitOfMeasure.findMany({
      where,
      orderBy: { name: "asc" },
    });
  }

  async getUnit(orgId?: string, unitId?: string) {
    if (!orgId || !unitId) {
      throw new NotFoundException("Unit of measure not found");
    }
    const unit = await this.prisma.unitOfMeasure.findFirst({
      where: { id: unitId, orgId },
    });
    if (!unit) {
      throw new NotFoundException("Unit of measure not found");
    }
    return unit;
  }

  async createUnit(
    orgId?: string,
    actorUserId?: string,
    input?: UnitOfMeasureCreateInput,
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

    const scopedKey = buildIdempotencyKey(idempotencyKey, {
      scope: "units.create",
      actorUserId,
    });
    const requestHash = scopedKey ? hashRequestBody(input) : null;
    if (scopedKey) {
      const existingKey = await this.prisma.idempotencyKey.findUnique({
        where: { orgId_key: { orgId, key: scopedKey } },
      });
      if (existingKey) {
        if (existingKey.requestHash !== requestHash) {
          throw new ConflictException("Idempotency key already used with different payload");
        }
        return existingKey.response as unknown as UnitRecord;
      }
    }

    const baseUnitId = input.baseUnitId ?? null;
    if (baseUnitId) {
      await this.assertBaseUnit(orgId, baseUnitId);
    }

    const conversionRate = baseUnitId ? input.conversionRate : 1;
    if (baseUnitId && (!conversionRate || conversionRate <= 0)) {
      throw new BadRequestException("Conversion rate is required for derived units");
    }

    const unit = await this.prisma.unitOfMeasure.create({
      data: {
        orgId,
        name: input.name,
        symbol: input.symbol,
        baseUnitId,
        conversionRate,
        isActive: input.isActive ?? true,
      },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "UNIT_OF_MEASURE",
      entityId: unit.id,
      action: AuditAction.CREATE,
      after: unit,
    });

    if (scopedKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: scopedKey,
          requestHash,
          response: unit as unknown as object,
          statusCode: 201,
        },
      });
    }

    return unit;
  }

  async updateUnit(
    orgId?: string,
    unitId?: string,
    actorUserId?: string,
    input?: UnitOfMeasureUpdateInput,
  ) {
    if (!orgId || !unitId) {
      throw new NotFoundException("Unit of measure not found");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const unit = await this.prisma.unitOfMeasure.findFirst({
      where: { id: unitId, orgId },
    });
    if (!unit) {
      throw new NotFoundException("Unit of measure not found");
    }

    const baseUnitId = input.baseUnitId ?? unit.baseUnitId ?? null;
    if (baseUnitId && baseUnitId !== unitId) {
      await this.assertBaseUnit(orgId, baseUnitId);
    }
    if (baseUnitId === unitId) {
      throw new BadRequestException("Unit cannot reference itself as base");
    }

    const conversionRate = baseUnitId ? (input.conversionRate ?? unit.conversionRate) : 1;
    const conversionRateValue = conversionRate == null ? conversionRate : Number(conversionRate);
    if (baseUnitId && (!conversionRateValue || conversionRateValue <= 0)) {
      throw new BadRequestException("Conversion rate is required for derived units");
    }

    const updated = await this.prisma.unitOfMeasure.update({
      where: { id: unitId },
      data: {
        name: input.name ?? unit.name,
        symbol: input.symbol ?? unit.symbol,
        baseUnitId,
        conversionRate: conversionRateValue ?? 1,
        isActive: input.isActive ?? unit.isActive,
      },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "UNIT_OF_MEASURE",
      entityId: unitId,
      action: AuditAction.UPDATE,
      before: unit,
      after: updated,
    });

    return updated;
  }

  private async assertBaseUnit(orgId: string, baseUnitId: string) {
    const baseUnit = await this.prisma.unitOfMeasure.findFirst({
      where: { id: baseUnitId, orgId },
      select: { id: true, baseUnitId: true, isActive: true },
    });
    if (!baseUnit) {
      throw new NotFoundException("Base unit of measure not found");
    }
    if (!baseUnit.isActive) {
      throw new BadRequestException("Base unit must be active");
    }
    if (baseUnit.baseUnitId) {
      throw new BadRequestException("Base unit must reference the root unit");
    }
  }
}
