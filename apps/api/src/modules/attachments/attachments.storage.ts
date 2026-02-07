import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { createReadStream, promises as fs } from "fs";
import { dirname, join } from "path";
import { Readable } from "stream";
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getApiEnv } from "../../common/env";

type SaveParams = {
  orgId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
};

@Injectable()
export class AttachmentsStorageService {
  private readonly env = getApiEnv();
  private readonly driver = this.env.ATTACHMENTS_DRIVER;
  private readonly localRoot = this.resolveLocalRoot();
  private readonly s3 = this.driver === "s3" ? this.createS3Client() : null;

  async save(params: SaveParams) {
    const storageKey = this.buildStorageKey(params.orgId, params.fileName);
    if (this.driver === "s3") {
      const bucket = this.requireS3Bucket();
      await this.s3?.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: storageKey,
          Body: params.buffer,
          ContentType: params.mimeType,
        }),
      );
    } else {
      const target = join(this.localRoot, storageKey);
      await fs.mkdir(dirname(target), { recursive: true });
      await fs.writeFile(target, params.buffer);
    }

    return { storageKey };
  }

  async remove(storageKey: string) {
    if (this.driver === "s3") {
      const bucket = this.requireS3Bucket();
      try {
        await this.s3?.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }));
      } catch {
        // ignore missing objects
      }
      return;
    }

    const target = join(this.localRoot, storageKey);
    try {
      await fs.unlink(target);
    } catch {
      // ignore missing files
    }
  }

  async getStream(storageKey: string): Promise<Readable> {
    if (this.driver === "s3") {
      const bucket = this.requireS3Bucket();
      const result = await this.s3?.send(new GetObjectCommand({ Bucket: bucket, Key: storageKey }));
      const body = result?.Body;
      if (!body) {
        throw new Error("Attachment stream is unavailable.");
      }
      if (body instanceof Readable) {
        return body;
      }
      if (body && typeof (Readable as typeof Readable & { fromWeb?: (stream: ReadableStream) => Readable }).fromWeb === "function") {
        return (Readable as typeof Readable & { fromWeb: (stream: ReadableStream) => Readable }).fromWeb(body as ReadableStream);
      }
      throw new Error("Attachment stream is unavailable.");
    }

    return createReadStream(join(this.localRoot, storageKey));
  }

  private resolveLocalRoot() {
    const raw = this.env.ATTACHMENTS_LOCAL_DIR?.trim();
    if (!raw) {
      return join(process.cwd(), "storage", "attachments");
    }
    if (raw.startsWith(".") || raw.startsWith("..")) {
      return join(process.cwd(), raw);
    }
    return raw;
  }

  private createS3Client() {
    const endpoint = this.env.ATTACHMENTS_S3_ENDPOINT?.trim();
    return new S3Client({
      region: this.env.ATTACHMENTS_S3_REGION || "us-east-1",
      endpoint: endpoint || undefined,
      forcePathStyle: this.env.ATTACHMENTS_S3_FORCE_PATH_STYLE,
      credentials: this.env.ATTACHMENTS_S3_ACCESS_KEY_ID
        ? {
            accessKeyId: this.env.ATTACHMENTS_S3_ACCESS_KEY_ID,
            secretAccessKey: this.env.ATTACHMENTS_S3_SECRET_ACCESS_KEY,
          }
        : undefined,
    });
  }

  private requireS3Bucket() {
    if (!this.env.ATTACHMENTS_S3_BUCKET) {
      throw new Error("ATTACHMENTS_S3_BUCKET is required when ATTACHMENTS_DRIVER=s3");
    }
    return this.env.ATTACHMENTS_S3_BUCKET;
  }

  private buildStorageKey(orgId: string, fileName: string) {
    const safeName = this.sanitizeFileName(fileName);
    return `orgs/${orgId}/attachments/${Date.now()}-${randomUUID()}-${safeName}`;
  }

  private sanitizeFileName(fileName: string) {
    const base = fileName.split(/[\\/]/).pop() ?? "attachment";
    const normalized = base.trim() || "attachment";
    return normalized.replace(/[^a-zA-Z0-9._-]/g, "_");
  }
}
