import type { ErrorRequestHandler, Request, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type Role = "admin" | "cashier";
export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

export const JWT_SECRET = process.env.JWT_SECRET ?? "dev-only-change-me";
if (!process.env.JWT_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("JWT_SECRET must be set in production");
}

export function signToken(user: AuthUser) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "12h" });
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HttpError(401, "Authentication required");
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = { id: payload.id, name: payload.name, email: payload.email, role: payload.role };
  } catch {
    throw new HttpError(401, "Session expired, please sign in again");
  }
  next();
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new HttpError(403, "You do not have permission to do that");
    }
    next();
  };

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw new HttpError(401, "Authentication required");
  return req.user;
}

export function idParam(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid id");
  return id;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const field = first?.path.join(".");
    res.status(400).json({
      error: field ? `${field}: ${first.message}` : (first?.message ?? "Invalid input"),
      issues: err.issues,
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err?.code === "SQLITE_CONSTRAINT_UNIQUE") {
    // e.g. "UNIQUE constraint failed: products.barcode"
    const column = String(err.message).split(": ").pop() ?? "";
    const friendly: Record<string, string> = {
      "products.sku": "That SKU is already used by another product",
      "products.barcode": "That barcode is already used by another product",
      "users.email": "An account with that email already exists",
    };
    res.status(409).json({ error: friendly[column] ?? "A record with that value already exists" });
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Malformed JSON body" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
