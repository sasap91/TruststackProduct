/**
 * Lightweight request validation helpers.
 *
 * Avoids adding a runtime schema library; keeps validation explicit and typed.
 * All validators throw ApiError, which routes catch and convert to responses.
 */

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  toResponse() {
    return Response.json({ error: this.message }, { status: this.statusCode });
  }
}

// ── FormData helpers ──────────────────────────────────────────────────────────

export function requireString(
  value: FormDataEntryValue | string | null | undefined,
  field: string,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, `${field} is required.`);
  }
  return value.trim();
}

export function optionalString(
  value: FormDataEntryValue | string | null | undefined,
): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function optionalFloat01(
  value: FormDataEntryValue | string | null | undefined,
): number | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : Math.min(1, Math.max(0, n));
}

export function optionalPositiveNumber(
  value: FormDataEntryValue | string | null | undefined,
): number | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const n = Number(value);
  return Number.isNaN(n) || n <= 0 ? undefined : n;
}

export function optionalBoolean(
  value: FormDataEntryValue | string | null | undefined,
): boolean | undefined {
  if (value === "true")  return true;
  if (value === "false") return false;
  return undefined;
}

// ── JSON body helpers ─────────────────────────────────────────────────────────

export async function requireJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.");
  }
}

export function requireField<T>(
  body: Record<string, unknown>,
  field: string,
  type: "string" | "number" | "boolean",
): T {
  const value = body[field];
  if (value === undefined || value === null) {
    throw new ApiError(400, `${field} is required.`);
  }
  // eslint-disable-next-line valid-typeof
  if (typeof value !== type) {
    throw new ApiError(400, `${field} must be a ${type}.`);
  }
  return value as T;
}

export function optionalField<T>(
  body: Record<string, unknown>,
  field: string,
): T | undefined {
  const v = body[field];
  return v !== undefined && v !== null ? (v as T) : undefined;
}

// ── Route error handler ───────────────────────────────────────────────────────

/** Wrap a route handler so ApiErrors are converted to JSON responses. */
export function withErrorHandling(
  handler: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>,
): (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) return err.toResponse();
      console.error("[API]", err);
      return Response.json({ error: "Internal server error." }, { status: 500 });
    }
  };
}
