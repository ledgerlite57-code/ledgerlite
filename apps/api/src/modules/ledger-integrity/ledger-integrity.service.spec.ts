import { LedgerIntegrityService } from "./ledger-integrity.service";
import type { PrismaService } from "../../prisma/prisma.service";

const createService = () => {
  const prisma = {
    $queryRaw: jest.fn(),
  } as unknown as PrismaService;
  const service = new LedgerIntegrityService(prisma);
  return { prisma, service };
};

describe("LedgerIntegrityService", () => {
  it("returns ok=false and logs when integrity issues are found", async () => {
    const { prisma, service } = createService();
    const loggerSpy = jest.spyOn((service as any).logger, "error").mockImplementation(() => undefined);

    prisma.$queryRaw = jest
      .fn()
      .mockResolvedValueOnce([
        {
          headerId: "hdr-1",
          sourceType: "JOURNAL",
          sourceId: "src-1",
          postingDate: new Date(),
          totalDebit: "100.00",
          totalCredit: "90.00",
          lineDebit: "100.00",
          lineCredit: "90.00",
        },
      ])
      .mockResolvedValueOnce([
        {
          lineId: "line-1",
          headerId: "hdr-1",
          debit: "10.00",
          credit: "10.00",
        },
      ]);

    const result = await service.audit("org-1", { limit: 50 });

    expect(result.ok).toBe(false);
    expect(result.totals.headerIssues).toBe(1);
    expect(result.totals.lineIssues).toBe(1);
    expect(loggerSpy).toHaveBeenCalledTimes(1);
  });

  it("returns ok=true and does not log when no issues", async () => {
    const { prisma, service } = createService();
    const loggerSpy = jest.spyOn((service as any).logger, "error").mockImplementation(() => undefined);

    prisma.$queryRaw = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await service.audit("org-1", { limit: 50 });

    expect(result.ok).toBe(true);
    expect(result.totals.headerIssues).toBe(0);
    expect(result.totals.lineIssues).toBe(0);
    expect(loggerSpy).not.toHaveBeenCalled();
  });
});
