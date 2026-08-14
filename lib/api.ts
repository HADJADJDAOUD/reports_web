import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { ZodError, type ZodType } from "zod";
import { getSession, type SessionPayload } from "@/lib/auth/session";

/** Thrown by helpers below; converted into a JSON response by `handle`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function badRequest(message: string, details?: unknown): ApiError {
  return new ApiError(400, message, details);
}

export function notFound(message = "Not found"): ApiError {
  return new ApiError(404, message);
}

export function unauthorized(message = "Sign in required"): ApiError {
  return new ApiError(401, message);
}

/**
 * Wraps a route handler so that thrown ApiErrors and unexpected failures both
 * turn into predictable JSON instead of leaking stack traces to the client.
 */
export async function handle<T>(
  fn: () => Promise<T>,
): Promise<NextResponse<T | { error: string; details?: unknown }>> {
  try {
    const result = await fn();
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid request body", details: error.issues },
        { status: 400 },
      );
    }
    console.error("Unhandled API error", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}

/** Session or 401. Every report/attachment route goes through this. */
export async function requireUser(): Promise<
  SessionPayload & { objectId: ObjectId }
> {
  const session = await getSession();
  if (!session || !ObjectId.isValid(session.userId)) {
    throw unauthorized();
  }
  return { ...session, objectId: new ObjectId(session.userId) };
}

export async function parseBody<S extends ZodType>(
  request: Request,
  schema: S,
): Promise<S["_output"]> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw badRequest("Invalid request body", result.error.issues);
  }
  return result.data;
}

export function toObjectId(value: string, label = "id"): ObjectId {
  if (!ObjectId.isValid(value)) throw badRequest(`Invalid ${label}`);
  return new ObjectId(value);
}
