import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ONBOARDING_STEP_DEFINITIONS,
  ONBOARDING_TRACK_STEPS,
  Permissions,
  resolveOnboardingTrack,
  type OnboardingRuleCode,
  type OnboardingStepId,
  type OnboardingStepUpdateInput,
  type OnboardingTrack,
} from "@ledgerlite/shared";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

type EnsureOnboardingProgressInput = {
  orgId: string;
  userId: string;
  membershipId: string;
  roleName?: string | null;
  track?: OnboardingTrack;
};

type ProgressStepRecord = {
  id: string;
  stepId: string;
  position: number;
  status: "PENDING" | "COMPLETED" | "NOT_APPLICABLE";
  completedAt: Date | null;
  notApplicableAt: Date | null;
  meta: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type ProgressRecord = {
  id: string;
  orgId: string;
  userId: string;
  membershipId: string;
  roleName: string | null;
  track: OnboardingTrack;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  steps: ProgressStepRecord[];
};

type OnboardingEvaluationContext = {
  permissionSet: Set<string>;
  organization: {
    name: string;
    legalName: string | null;
    countryCode: string | null;
    baseCurrency: string | null;
    fiscalYearStartMonth: number | null;
    timeZone: string | null;
    vatEnabled: boolean;
  } | null;
  orgSettings: {
    defaultArAccountId: string | null;
    defaultApAccountId: string | null;
  } | null;
  coreAccountSubtypes: Set<string>;
  taxCodeCount: number;
  bankAccountCount: number;
  customerCount: number;
  vendorCount: number;
  inviteCount: number;
  activeMembershipCount: number;
  postedInvoiceCount: number;
  postedBillCount: number;
  postedExpenseCount: number;
  postedPaymentReceivedCount: number;
  postedVendorPaymentCount: number;
  postedJournalCount: number;
  postedPdcCount: number;
};

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async getProgress(orgId?: string, userId?: string, membershipId?: string) {
    const progress = await this.ensureProgressRecord({ orgId, userId, membershipId });
    const evaluated = await this.evaluateProgressSteps(progress);
    return this.serializeProgress(evaluated);
  }

  async ensureProgress(input: EnsureOnboardingProgressInput) {
    const progress = await this.ensureProgressRecord(input);
    const evaluated = await this.evaluateProgressSteps(progress);
    return this.serializeProgress(evaluated);
  }

  async updateStepStatus(
    orgId?: string,
    userId?: string,
    membershipId?: string,
    stepId?: string,
    input?: OnboardingStepUpdateInput,
  ) {
    if (!stepId || !input) {
      throw new NotFoundException("Onboarding step not found");
    }

    const progress = await this.ensureProgressRecord({ orgId, userId, membershipId });
    const step = progress.steps.find((candidate) => candidate.stepId === stepId);
    if (!step) {
      throw new NotFoundException("Onboarding step not found");
    }

    const existingMeta = this.asRecord(step.meta);
    const incomingMeta = input.meta ?? {};
    const nextMeta = { ...existingMeta, ...incomingMeta };
    const now = new Date();

    await this.prisma.onboardingProgressStep.update({
      where: { id: step.id },
      data: {
        status: input.status,
        completedAt: input.status === "COMPLETED" ? now : null,
        notApplicableAt: input.status === "NOT_APPLICABLE" ? now : null,
        ...(Object.keys(nextMeta).length > 0 ? { meta: nextMeta as Prisma.InputJsonValue } : {}),
      },
    });

    await this.syncCompletionState(progress.id);
    return this.getProgress(orgId, userId, membershipId);
  }

  async markComplete(orgId?: string, userId?: string, membershipId?: string) {
    const progress = await this.ensureProgressRecord({ orgId, userId, membershipId });
    const evaluated = await this.evaluateProgressSteps(progress);
    const pending = evaluated.steps.filter((step) => step.status === "PENDING");
    if (pending.length > 0) {
      const pendingStepIds = pending.map((step) => step.stepId).join(", ");
      throw new ConflictException(`Cannot complete onboarding while steps are pending: ${pendingStepIds}`);
    }

    if (!evaluated.completedAt) {
      await this.prisma.onboardingProgress.update({
        where: { id: evaluated.id },
        data: { completedAt: new Date() },
      });
    }

    return this.getProgress(orgId, userId, membershipId);
  }

  private async ensureProgressRecord(input: Partial<EnsureOnboardingProgressInput>) {
    const { orgId, userId, membershipId } = input;
    if (!orgId || !userId || !membershipId) {
      throw new NotFoundException("Onboarding progress not found");
    }

    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      select: {
        id: true,
        orgId: true,
        userId: true,
        role: {
          select: { name: true },
        },
      },
    });
    if (!membership || membership.orgId !== orgId || membership.userId !== userId) {
      throw new ConflictException("Invalid membership context");
    }

    const roleName = input.roleName ?? membership.role?.name ?? null;
    const track = input.track ?? resolveOnboardingTrack(roleName);

    const existing = await this.loadProgressRecord(orgId, userId);
    if (existing) {
      return existing;
    }

    return this.prisma.onboardingProgress.create({
      data: {
        orgId,
        userId,
        membershipId,
        roleName,
        track,
        steps: {
          create: this.seedTrackSteps(track),
        },
      },
      include: {
        steps: {
          orderBy: { position: "asc" },
        },
      },
    });
  }

  private async loadProgressRecord(orgId: string, userId: string): Promise<ProgressRecord | null> {
    return this.prisma.onboardingProgress.findUnique({
      where: { orgId_userId: { orgId, userId } },
      include: {
        steps: {
          orderBy: { position: "asc" },
        },
      },
    }) as Promise<ProgressRecord | null>;
  }

  private async evaluateProgressSteps(progress: ProgressRecord): Promise<ProgressRecord> {
    const pendingSteps = progress.steps.filter((step) => step.status === "PENDING");
    if (pendingSteps.length === 0) {
      return progress;
    }

    const context = await this.buildEvaluationContext(progress.orgId, progress.membershipId);
    const stepUpdates = pendingSteps
      .map((step) => ({
        step,
        targetStatus: this.resolveStepStatus(step.stepId, context),
      }))
      .filter((candidate) => candidate.targetStatus !== "PENDING");

    if (stepUpdates.length === 0) {
      return progress;
    }

    await this.prisma.$transaction(
      stepUpdates.map((candidate) =>
        this.prisma.onboardingProgressStep.update({
          where: { id: candidate.step.id },
          data: {
            status: candidate.targetStatus,
            completedAt: candidate.targetStatus === "COMPLETED" ? new Date() : null,
            notApplicableAt: candidate.targetStatus === "NOT_APPLICABLE" ? new Date() : null,
          },
        }),
      ),
    );

    await this.syncCompletionState(progress.id);
    const refreshed = await this.loadProgressRecord(progress.orgId, progress.userId);
    if (!refreshed) {
      throw new NotFoundException("Onboarding progress not found");
    }
    return refreshed;
  }

  private async buildEvaluationContext(orgId: string, membershipId: string): Promise<OnboardingEvaluationContext> {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      select: {
        role: {
          select: {
            rolePermissions: {
              select: { permissionCode: true },
            },
          },
        },
      },
    });
    const permissionSet = new Set(membership?.role.rolePermissions.map((item) => item.permissionCode) ?? []);

    const [
      organization,
      orgSettings,
      coreAccounts,
      taxCodeCount,
      bankAccountCount,
      customerCount,
      vendorCount,
      inviteCount,
      activeMembershipCount,
      postedInvoiceCount,
      postedBillCount,
      postedExpenseCount,
      postedPaymentReceivedCount,
      postedVendorPaymentCount,
      postedJournalCount,
      postedPdcCount,
    ] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: orgId },
        select: {
          name: true,
          legalName: true,
          countryCode: true,
          baseCurrency: true,
          fiscalYearStartMonth: true,
          timeZone: true,
          vatEnabled: true,
        },
      }),
      this.prisma.orgSettings.findUnique({
        where: { orgId },
        select: { defaultArAccountId: true, defaultApAccountId: true },
      }),
      this.prisma.account.findMany({
        where: {
          orgId,
          subtype: { in: ["AR", "AP", "VAT_PAYABLE", "BANK", "CASH"] },
        },
        select: { subtype: true },
      }),
      this.prisma.taxCode.count({
        where: { orgId, isActive: true },
      }),
      this.prisma.bankAccount.count({
        where: { orgId, isActive: true },
      }),
      this.prisma.customer.count({
        where: { orgId },
      }),
      this.prisma.vendor.count({
        where: { orgId },
      }),
      this.prisma.invite.count({
        where: { orgId },
      }),
      this.prisma.membership.count({
        where: { orgId, isActive: true },
      }),
      this.prisma.invoice.count({
        where: { orgId, status: "POSTED" },
      }),
      this.prisma.bill.count({
        where: { orgId, status: "POSTED" },
      }),
      this.prisma.expense.count({
        where: { orgId, status: "POSTED" },
      }),
      this.prisma.paymentReceived.count({
        where: { orgId, status: "POSTED" },
      }),
      this.prisma.vendorPayment.count({
        where: { orgId, status: "POSTED" },
      }),
      this.prisma.journalEntry.count({
        where: { orgId, status: "POSTED" },
      }),
      this.prisma.pdc.count({
        where: {
          orgId,
          status: {
            in: ["SCHEDULED", "DEPOSITED", "CLEARED", "BOUNCED", "CANCELLED"],
          },
        },
      }),
    ]);

    return {
      permissionSet,
      organization,
      orgSettings,
      coreAccountSubtypes: new Set(coreAccounts.map((account) => account.subtype).filter(Boolean) as string[]),
      taxCodeCount,
      bankAccountCount,
      customerCount,
      vendorCount,
      inviteCount,
      activeMembershipCount,
      postedInvoiceCount,
      postedBillCount,
      postedExpenseCount,
      postedPaymentReceivedCount,
      postedVendorPaymentCount,
      postedJournalCount,
      postedPdcCount,
    };
  }

  private resolveStepStatus(stepId: string, context: OnboardingEvaluationContext): "PENDING" | "COMPLETED" | "NOT_APPLICABLE" {
    const definition = this.getStepDefinition(stepId);
    if (!definition) {
      return "PENDING";
    }

    const requiredPermissions = definition.requiredAnyPermissions ?? [];
    if (requiredPermissions.length > 0 && !requiredPermissions.some((code) => context.permissionSet.has(code))) {
      return definition.autoCompleteWhenNoPermission ? "NOT_APPLICABLE" : "PENDING";
    }

    if (definition.completionRules.length === 0) {
      return "PENDING";
    }

    const isComplete = definition.completionRules.every((ruleCode) => this.evaluateRule(ruleCode, context));
    return isComplete ? "COMPLETED" : "PENDING";
  }

  private evaluateRule(ruleCode: OnboardingRuleCode, context: OnboardingEvaluationContext): boolean {
    switch (ruleCode) {
      case "ORG_PROFILE_CORE_FIELDS_SET":
        return Boolean(
          context.organization?.name?.trim() &&
            context.organization.legalName?.trim() &&
            context.organization.countryCode?.trim() &&
            context.organization.baseCurrency?.trim() &&
            context.organization.timeZone?.trim() &&
            typeof context.organization.fiscalYearStartMonth === "number" &&
            context.organization.fiscalYearStartMonth >= 1 &&
            context.organization.fiscalYearStartMonth <= 12,
        );
      case "ORG_SETTINGS_PRESENT":
        return Boolean(context.orgSettings);
      case "CORE_ACCOUNTS_PRESENT":
        return (
          context.coreAccountSubtypes.has("AR") &&
          context.coreAccountSubtypes.has("AP") &&
          context.coreAccountSubtypes.has("VAT_PAYABLE") &&
          (context.coreAccountSubtypes.has("BANK") || context.coreAccountSubtypes.has("CASH"))
        );
      case "DEFAULT_GL_LINKS_PRESENT":
        return Boolean(context.orgSettings?.defaultArAccountId && context.orgSettings?.defaultApAccountId);
      case "VAT_DISABLED_OR_TAX_CODE_EXISTS":
        return !context.organization?.vatEnabled || context.taxCodeCount > 0;
      case "ACTIVE_BANK_ACCOUNT_EXISTS":
        return context.bankAccountCount > 0;
      case "MASTER_DATA_BY_PERMISSION_READY": {
        const canManageCustomers = context.permissionSet.has(Permissions.CUSTOMER_WRITE);
        const canManageVendors = context.permissionSet.has(Permissions.VENDOR_WRITE);
        if (canManageCustomers && canManageVendors) {
          return context.customerCount > 0 || context.vendorCount > 0;
        }
        if (canManageCustomers) {
          return context.customerCount > 0;
        }
        if (canManageVendors) {
          return context.vendorCount > 0;
        }
        return false;
      }
      case "FIRST_POSTED_TRANSACTION_EXISTS":
        return (
          (context.permissionSet.has(Permissions.INVOICE_POST) && context.postedInvoiceCount > 0) ||
          (context.permissionSet.has(Permissions.BILL_POST) && context.postedBillCount > 0) ||
          (context.permissionSet.has(Permissions.EXPENSE_POST) && context.postedExpenseCount > 0) ||
          (context.permissionSet.has(Permissions.PAYMENT_RECEIVED_POST) && context.postedPaymentReceivedCount > 0) ||
          (context.permissionSet.has(Permissions.VENDOR_PAYMENT_POST) && context.postedVendorPaymentCount > 0) ||
          (context.permissionSet.has(Permissions.JOURNAL_POST) && context.postedJournalCount > 0) ||
          (context.permissionSet.has(Permissions.PDC_POST) && context.postedPdcCount > 0)
        );
      case "TEAM_MEMBER_OR_INVITE_EXISTS":
        return context.inviteCount > 0 || context.activeMembershipCount > 1;
      default:
        return false;
    }
  }

  private async syncCompletionState(progressId: string) {
    const steps = await this.prisma.onboardingProgressStep.findMany({
      where: { progressId },
      select: { status: true },
    });
    const hasPending = steps.some((step) => step.status === "PENDING");
    await this.prisma.onboardingProgress.update({
      where: { id: progressId },
      data: {
        completedAt: hasPending ? null : new Date(),
      },
    });
  }

  private serializeProgress(progress: ProgressRecord) {
    const orderedSteps = [...progress.steps].sort((a, b) => a.position - b.position);
    const stepRecords = orderedSteps.map((step) => {
      const definition = this.getStepDefinition(step.stepId);
      return {
        id: step.id,
        stepId: step.stepId,
        position: step.position,
        status: step.status,
        completedAt: step.completedAt,
        notApplicableAt: step.notApplicableAt,
        title: definition?.title ?? step.stepId,
        description: definition?.description ?? "Custom onboarding step",
        completionRules: definition?.completionRules ?? [],
        requiredAnyPermissions: definition?.requiredAnyPermissions ?? [],
        autoCompleteWhenNoPermission: Boolean(definition?.autoCompleteWhenNoPermission),
        meta: step.meta,
      };
    });
    const doneCount = stepRecords.filter((step) => step.status !== "PENDING").length;
    const totalCount = stepRecords.length;
    const completionPercent = totalCount === 0 ? 100 : Math.round((doneCount / totalCount) * 100);

    return {
      id: progress.id,
      orgId: progress.orgId,
      userId: progress.userId,
      membershipId: progress.membershipId,
      roleName: progress.roleName,
      track: progress.track,
      completedAt: progress.completedAt,
      createdAt: progress.createdAt,
      updatedAt: progress.updatedAt,
      summary: {
        totalSteps: totalCount,
        completedSteps: doneCount,
        pendingSteps: totalCount - doneCount,
        completionPercent,
      },
      steps: stepRecords,
    };
  }

  private getStepDefinition(stepId: string) {
    if (!Object.prototype.hasOwnProperty.call(ONBOARDING_STEP_DEFINITIONS, stepId)) {
      return null;
    }
    return ONBOARDING_STEP_DEFINITIONS[stepId as OnboardingStepId];
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private seedTrackSteps(track: OnboardingTrack) {
    const stepIds = ONBOARDING_TRACK_STEPS[track];
    return stepIds.map((stepId, index) => this.buildStepSeed(stepId, index + 1));
  }

  private buildStepSeed(stepId: OnboardingStepId, position: number) {
    const definition = ONBOARDING_STEP_DEFINITIONS[stepId];
    return {
      stepId,
      position,
      meta: {
        title: definition.title,
        description: definition.description,
        completionRules: definition.completionRules,
        requiredAnyPermissions: definition.requiredAnyPermissions ?? [],
        autoCompleteWhenNoPermission: Boolean(definition.autoCompleteWhenNoPermission),
      } as Prisma.InputJsonValue,
    };
  }
}
