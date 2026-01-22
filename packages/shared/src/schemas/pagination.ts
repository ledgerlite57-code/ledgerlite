import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

export const paginationSchema = z.object({
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).default(1)),
  pageSize: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100).default(20)),
  sortBy: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  sortDir: z.preprocess(emptyToUndefined, z.enum(["asc", "desc"]).optional()),
  q: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export type PageInfo = {
  page: number;
  pageSize: number;
  total: number;
};

export type PaginatedResponse<T> = {
  data: T[];
  pageInfo: PageInfo;
};
