import { MongoClient, type Db, type Collection } from "mongodb";
import { env } from "@/lib/env";
import type { AttachmentDoc, ReportDoc, UserDoc } from "./models";

/**
 * A single MongoClient is reused across invocations. In development the value is
 * cached on globalThis so hot reloads do not open a new pool every time.
 */
declare global {
  var __lexisMongo: Promise<MongoClient> | undefined;
}

function createClient(): Promise<MongoClient> {
  const client = new MongoClient(env.mongoUri, {
    maxPoolSize: 10,
    retryWrites: true,
  });
  return client.connect();
}

let indexesReady: Promise<void> | undefined;

async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection<UserDoc>("users").createIndex({ email: 1 }, { unique: true }),
    db
      .collection<ReportDoc>("reports")
      .createIndex({ ownerId: 1, updatedAt: -1 }),
    db
      .collection<AttachmentDoc>("attachments")
      .createIndex({ reportId: 1, createdAt: 1 }),
    db.collection<AttachmentDoc>("attachments").createIndex({ blockIds: 1 }),
  ]);
}

export async function getDb(): Promise<Db> {
  if (!global.__lexisMongo) {
    global.__lexisMongo = createClient();
  }
  const client = await global.__lexisMongo;
  const db = client.db(env.mongoDb);
  if (!indexesReady) {
    // Index creation is idempotent; failures must not break request handling.
    indexesReady = ensureIndexes(db).catch((error) => {
      console.error("Failed to ensure MongoDB indexes", error);
    });
  }
  await indexesReady;
  return db;
}

export async function users(): Promise<Collection<UserDoc>> {
  return (await getDb()).collection<UserDoc>("users");
}

export async function reports(): Promise<Collection<ReportDoc>> {
  return (await getDb()).collection<ReportDoc>("reports");
}

export async function attachments(): Promise<Collection<AttachmentDoc>> {
  return (await getDb()).collection<AttachmentDoc>("attachments");
}
