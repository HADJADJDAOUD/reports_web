import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

/**
 * Cloudflare R2 access. Credentials never leave the server: the browser only
 * ever receives short-lived presigned URLs for the exact key it may write.
 */
let client: S3Client | undefined;

function r2(): S3Client {
  if (!client) {
    const config = env.r2;
    client = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      // R2 addresses objects as <endpoint>/<bucket>/<key>; path-style keeps the
      // SDK from folding the bucket into the hostname.
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return client;
}

function bucket(): string {
  return env.r2.bucket;
}

/** Presigned PUT so the browser can upload the original file straight to R2. */
export async function presignUpload(
  key: string,
  contentType: string,
  expiresInSeconds = 300,
): Promise<string> {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: expiresInSeconds },
  );
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await r2().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const response = await r2().send(
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
  );
  if (!response.Body) throw new Error(`Empty object body for key ${key}`);
  const bytes = await response.Body.transformToByteArray();
  return Buffer.from(bytes);
}

export async function headObjectSize(key: string): Promise<number> {
  const response = await r2().send(
    new HeadObjectCommand({ Bucket: bucket(), Key: key }),
  );
  return response.ContentLength ?? 0;
}

export async function deleteObjects(keys: string[]): Promise<void> {
  const unique = [...new Set(keys)].filter(Boolean);
  if (unique.length === 0) return;
  // DeleteObjects accepts up to 1000 keys per call.
  for (let index = 0; index < unique.length; index += 1000) {
    const batch = unique.slice(index, index + 1000);
    await r2().send(
      new DeleteObjectsCommand({
        Bucket: bucket(),
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
}
