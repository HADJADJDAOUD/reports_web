/**
 * Local sandbox for running and demoing the app without cloud credentials.
 *
 * Starts an in-memory MongoDB and a tiny S3-compatible object store on
 * localhost, then launches `next dev` pointed at them. Nothing here is used in
 * production — deployments talk to MongoDB Atlas and Cloudflare R2 through the
 * same code paths, configured purely by environment variables.
 *
 * Run with: npm run dev:sandbox
 */
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";

const BUCKET = "lexis-sandbox";
const S3_PORT = Number(process.env.SANDBOX_S3_PORT ?? 9010);
const APP_PORT = Number(process.env.PORT ?? 3000);

/* ------------------------------------------------------- object store stub */

/**
 * The few S3 operations this app uses: PUT/GET/HEAD/DELETE on an object and the
 * batch DeleteObjects POST. Signatures are not verified — it only ever listens
 * on localhost for local runs.
 */
function startObjectStore(): Promise<{ close: () => void }> {
  const objects = new Map<string, { body: Buffer; contentType: string }>();

  const readBody = (request: IncomingMessage): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => resolve(Buffer.concat(chunks)));
      request.on("error", reject);
    });

  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${S3_PORT}`);
    const segments = url.pathname.split("/").filter(Boolean);
    const bucket = segments.shift();
    const key = decodeURIComponent(segments.join("/"));

    // CORS, so the browser can PUT straight to the presigned URL.
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("access-control-allow-methods", "GET,PUT,HEAD,DELETE,POST");
    response.setHeader("access-control-allow-headers", "*");
    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }

    if (bucket !== BUCKET) {
      response.writeHead(404).end("NoSuchBucket");
      return;
    }

    if (request.method === "PUT") {
      const body = await readBody(request);
      objects.set(key, {
        body,
        contentType: request.headers["content-type"] ?? "application/octet-stream",
      });
      response.writeHead(200, { etag: `"${randomBytes(8).toString("hex")}"` }).end();
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      const object = objects.get(key);
      if (!object) {
        response.writeHead(404).end("NoSuchKey");
        return;
      }
      response.writeHead(200, {
        "content-type": object.contentType,
        "content-length": String(object.body.byteLength),
      });
      response.end(request.method === "HEAD" ? undefined : object.body);
      return;
    }

    if (request.method === "DELETE") {
      objects.delete(key);
      response.writeHead(204).end();
      return;
    }

    if (request.method === "POST" && url.searchParams.has("delete")) {
      const body = (await readBody(request)).toString("utf8");
      for (const match of body.matchAll(/<Key>([^<]*)<\/Key>/g)) {
        objects.delete(decodeXml(match[1]));
      }
      response.writeHead(200, { "content-type": "application/xml" });
      response.end('<?xml version="1.0" encoding="UTF-8"?><DeleteResult/>');
      return;
    }

    response.writeHead(405).end("MethodNotAllowed");
  });

  return new Promise((resolve) => {
    server.listen(S3_PORT, "127.0.0.1", () =>
      resolve({ close: () => server.close() }),
    );
  });
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/* ---------------------------------------------------------------- bootstrap */

async function main(): Promise<void> {
  const dataDir = mkdtempSync(path.join(tmpdir(), "lexis-sandbox-"));
  console.log("• starting in-memory MongoDB…");
  const mongo = await MongoMemoryServer.create();
  console.log("• starting local object store…");
  const store = await startObjectStore();

  const env = {
    ...process.env,
    MONGODB_URI: mongo.getUri(),
    MONGODB_DB: "lexis_sandbox",
    AUTH_SECRET: randomBytes(48).toString("base64url"),
    AUTH_SESSION_DAYS: "7",
    AUTH_ALLOW_REGISTRATION: "true",
    R2_ACCOUNT_ID: "sandbox",
    R2_ACCESS_KEY_ID: "sandbox",
    R2_SECRET_ACCESS_KEY: "sandbox-secret",
    R2_BUCKET: BUCKET,
    R2_ENDPOINT: `http://127.0.0.1:${S3_PORT}`,
    UPLOAD_MAX_MB: "25",
    PDF_PAGE_SIZE: "A4",
  };

  console.log(`• Mongo:  ${mongo.getUri()}`);
  console.log(`• Store:  http://127.0.0.1:${S3_PORT}/${BUCKET}`);
  console.log(`• App:    http://localhost:${APP_PORT}\n`);

  const child = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["next", "dev", "-p", String(APP_PORT)],
    { env, stdio: "inherit", shell: process.platform === "win32" },
  );

  const shutdown = async () => {
    child.kill();
    store.close();
    await mongo.stop();
    rmSync(dataDir, { recursive: true, force: true });
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  child.on("exit", shutdown);
}

void main();
