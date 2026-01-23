import { BadRequestException, NotFoundException } from "@nestjs/common";
import { UnitsOfMeasurementService } from "./units-of-measurement.service";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";

const createService = () => {
  const prisma = {
    unitOfMeasure: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    idempotencyKey: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  } as unknown as PrismaService;
  const audit = {
    log: jest.fn(),
  } as unknown as AuditService;
  const service = new UnitsOfMeasurementService(prisma, audit);
  return { prisma, audit, service };
};

describe("UnitsOfMeasurementService", () => {
  it("lists units with filters", async () => {
    const { prisma, service } = createService();
    prisma.unitOfMeasure.findMany = jest.fn().mockResolvedValue([{ id: "u1" }]);

    const result = await service.listUnits("org-1", "ea", true);

    expect(prisma.unitOfMeasure.findMany).toHaveBeenCalledWith({
      where: {
        orgId: "org-1",
        isActive: true,
        OR: [
          { name: { contains: "ea", mode: "insensitive" } },
          { symbol: { contains: "ea", mode: "insensitive" } },
        ],
      },
      orderBy: { name: "asc" },
    });
    expect(result).toEqual([{ id: "u1" }]);
  });

  it("creates a base unit with conversionRate = 1", async () => {
    const { prisma, service } = createService();
    prisma.unitOfMeasure.create = jest.fn().mockResolvedValue({ id: "base" });

    const created = await service.createUnit("org-1", "user-1", {
      name: "Each",
      symbol: "ea",
      baseUnitId: undefined,
      conversionRate: undefined,
      isActive: true,
    });

    expect(prisma.unitOfMeasure.create).toHaveBeenCalledWith({
      data: {
        orgId: "org-1",
        name: "Each",
        symbol: "ea",
        baseUnitId: null,
        conversionRate: 1,
        isActive: true,
      },
    });
    expect(created).toEqual({ id: "base" });
  });

  it("creates a derived unit when base unit is valid", async () => {
    const { prisma, service } = createService();
    prisma.unitOfMeasure.findFirst = jest.fn().mockResolvedValue({
      id: "base",
      baseUnitId: null,
      isActive: true,
    });
    prisma.unitOfMeasure.create = jest.fn().mockResolvedValue({ id: "derived" });

    const created = await service.createUnit("org-1", "user-1", {
      name: "Dozen",
      symbol: "doz",
      baseUnitId: "base",
      conversionRate: 12,
      isActive: true,
    });

    expect(prisma.unitOfMeasure.create).toHaveBeenCalledWith({
      data: {
        orgId: "org-1",
        name: "Dozen",
        symbol: "doz",
        baseUnitId: "base",
        conversionRate: 12,
        isActive: true,
      },
    });
    expect(created).toEqual({ id: "derived" });
  });

  it("rejects derived units without conversion rate", async () => {
    const { prisma, service } = createService();
    prisma.unitOfMeasure.findFirst = jest.fn().mockResolvedValue({
      id: "base",
      baseUnitId: null,
      isActive: true,
    });

    await expect(
      service.createUnit("org-1", "user-1", {
        name: "Dozen",
        symbol: "doz",
        baseUnitId: "base",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects base unit that is itself derived", async () => {
    const { prisma, service } = createService();
    prisma.unitOfMeasure.findFirst = jest.fn().mockResolvedValue({
      id: "derived",
      baseUnitId: "root",
      isActive: true,
    });

    await expect(
      service.createUnit("org-1", "user-1", {
        name: "Bad",
        symbol: "bad",
        baseUnitId: "derived",
        conversionRate: 2,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("updates unit and normalizes conversionRate", async () => {
    const { prisma, service } = createService();
    prisma.unitOfMeasure.findFirst = jest
      .fn()
      .mockResolvedValueOnce({
        id: "unit-1",
        name: "Dozen",
        symbol: "doz",
        baseUnitId: null,
        conversionRate: 1,
        isActive: true,
      })
      .mockResolvedValueOnce({
        id: "base",
        baseUnitId: null,
        isActive: true,
      });
    prisma.unitOfMeasure.update = jest.fn().mockResolvedValue({ id: "unit-1" });

    const updated = await service.updateUnit("org-1", "unit-1", "user-1", {
      baseUnitId: "base",
      conversionRate: 12,
    });

    expect(prisma.unitOfMeasure.update).toHaveBeenCalledWith({
      where: { id: "unit-1" },
      data: {
        name: "Dozen",
        symbol: "doz",
        baseUnitId: "base",
        conversionRate: 12,
        isActive: true,
      },
    });
    expect(updated).toEqual({ id: "unit-1" });
  });

  it("rejects setting baseUnitId equal to unit id", async () => {
    const { prisma, service } = createService();
    prisma.unitOfMeasure.findFirst = jest.fn().mockResolvedValue({
      id: "unit-1",
      name: "Each",
      symbol: "ea",
      baseUnitId: null,
      conversionRate: 1,
      isActive: true,
    });

    await expect(
      service.updateUnit("org-1", "unit-1", "user-1", {
        baseUnitId: "unit-1",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("throws when unit does not exist on update", async () => {
    const { prisma, service } = createService();
    prisma.unitOfMeasure.findFirst = jest.fn().mockResolvedValue(null);

    await expect(service.updateUnit("org-1", "missing", "user-1", { name: "X" })).rejects.toThrow(
      NotFoundException,
    );
  });
});
