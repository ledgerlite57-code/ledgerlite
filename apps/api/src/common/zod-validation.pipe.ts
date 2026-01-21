import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import { ZodSchema } from "zod";
import { ErrorCodes } from "@ledgerlite/shared";

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: ErrorCodes.VALIDATION_ERROR,
        message: "Validation failed",
        details: result.error.flatten().fieldErrors,
      });
    }
    return result.data;
  }
}
