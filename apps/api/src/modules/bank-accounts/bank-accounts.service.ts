import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class BankAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async listBankAccounts(orgId?: string) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    return this.prisma.bankAccount.findMany({
      where: { orgId, isActive: true },
      include: { glAccount: true },
      orderBy: { name: "asc" },
    });
  }
}
