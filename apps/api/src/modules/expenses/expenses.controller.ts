import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import {
  Permissions,
  paginationSchema,
  expenseCreateSchema,
  expenseUpdateSchema,
  type ExpenseCreateInput,
  type ExpenseUpdateInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";
import { ExpensesService } from "./expenses.service";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const listExpensesQuerySchema = paginationSchema.extend({
  status: z.string().optional(),
  search: z.string().optional(),
  vendorId: z.string().uuid().optional(),
  dateFrom: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  dateTo: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  amountMin: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  amountMax: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
});

type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;

@Controller("expenses")
@UseGuards(JwtAuthGuard, RbacGuard)
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  @RequirePermissions(Permissions.EXPENSE_READ)
  listExpenses(@Query(new ZodValidationPipe(listExpensesQuerySchema)) query: ListExpensesQuery) {
    const orgId = RequestContext.get()?.orgId;
    const { search, ...rest } = query;
    const q = query.q ?? search;
    return this.expenses.listExpenses(orgId, { ...rest, q });
  }

  @Get(":id")
  @RequirePermissions(Permissions.EXPENSE_READ)
  getExpense(@Param("id") id: string) {
    const orgId = RequestContext.get()?.orgId;
    return this.expenses.getExpense(orgId, id);
  }

  @Post()
  @RequirePermissions(Permissions.EXPENSE_WRITE)
  createExpense(
    @Body(new ZodValidationPipe(expenseCreateSchema)) body: ExpenseCreateInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.expenses.createExpense(orgId, actorUserId, body, idempotencyKey);
  }

  @Patch(":id")
  @RequirePermissions(Permissions.EXPENSE_WRITE)
  updateExpense(@Param("id") id: string, @Body(new ZodValidationPipe(expenseUpdateSchema)) body: ExpenseUpdateInput) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.expenses.updateExpense(orgId, id, actorUserId, body);
  }

  @Post(":id/post")
  @RequirePermissions(Permissions.EXPENSE_POST)
  postExpense(@Param("id") id: string, @Headers("idempotency-key") idempotencyKey?: string) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.expenses.postExpense(orgId, id, actorUserId, idempotencyKey);
  }

  @Post(":id/void")
  @RequirePermissions(Permissions.EXPENSE_POST)
  voidExpense(@Param("id") id: string, @Headers("idempotency-key") idempotencyKey?: string) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.expenses.voidExpense(orgId, id, actorUserId, idempotencyKey);
  }
}
