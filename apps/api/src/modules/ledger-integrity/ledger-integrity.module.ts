import { Module } from "@nestjs/common";
import { LedgerIntegrityService } from "./ledger-integrity.service";
import { LedgerIntegrityController } from "./ledger-integrity.controller";

@Module({
  controllers: [LedgerIntegrityController],
  providers: [LedgerIntegrityService],
})
export class LedgerIntegrityModule {}
