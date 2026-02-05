import * as Sentry from "@sentry/nextjs";
import { getSentryOptions } from "./src/lib/sentry-config";

Sentry.init(getSentryOptions("client"));
