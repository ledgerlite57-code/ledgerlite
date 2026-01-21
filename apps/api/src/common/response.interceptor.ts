import { CallHandler, Injectable, NestInterceptor } from "@nestjs/common";
import { ApiSuccess } from "@ledgerlite/shared";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { RequestContext } from "../logging/request-context";

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_context: unknown, next: CallHandler): Observable<ApiSuccess<unknown>> {
    return next.handle().pipe(
      map((data) => {
        const requestId = RequestContext.get()?.requestId;
        return {
          ok: true,
          data,
          requestId,
        };
      }),
    );
  }
}
