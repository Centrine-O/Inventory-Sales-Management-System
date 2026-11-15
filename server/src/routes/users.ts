import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { DB } from "../db.js";
import { HttpError, currentUser, idParam, requireRole } from "../http.js";
import { iso } from "../mappers.js";

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: "admin" | "cashier";
  active: number;
  created_at: string;
}

const mapUser = (u: UserRow) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  active: u.active === 1,
  createdAt: iso(u.created_at),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email(),
  role: z.enum(["admin", "cashier"]),
  password: z.string().min(8, "must be at least 8 characters"),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email().optional(),
  role: z.enum(["admin", "cashier"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8, "must be at least 8 characters").optional(),
});

export function usersRouter(db: DB) {
  const r = Router();
  r.use(requireRole("admin"));

  const getUser = (id: number) => {
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
    if (!u) throw new HttpError(404, "User not found");
    return u;
  };
  const activeAdminCount = () =>
    (db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").get() as { n: number }).n;

  r.get("/", (_req, res) => {
    const rows = db.prepare("SELECT * FROM users ORDER BY name").all() as UserRow[];
    res.json(rows.map(mapUser));
  });

  r.post("/", (req, res) => {
    const body = createSchema.parse(req.body);
    const info = db
      .prepare("INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, ?, ?)")
      .run(body.name, body.email, body.role, bcrypt.hashSync(body.password, 10));
    res.status(201).json(mapUser(getUser(Number(info.lastInsertRowid))));
  });

  r.patch("/:id", (req, res) => {
    const id = idParam(req);
    const body = updateSchema.parse(req.body);
    const existing = getUser(id);
    const me = currentUser(req);

    const losesAdmin =
      existing.role === "admin" && existing.active === 1 && (body.role === "cashier" || body.active === false);
    if (losesAdmin && id === me.id) throw new HttpError(400, "You cannot demote or deactivate your own account");
    if (losesAdmin && activeAdminCount() <= 1) throw new HttpError(400, "At least one active admin is required");

    db.prepare(
      `UPDATE users SET name = ?, email = ?, role = ?, active = ?,
         password_hash = COALESCE(?, password_hash) WHERE id = ?`,
    ).run(
      body.name ?? existing.name,
      body.email ?? existing.email,
      body.role ?? existing.role,
      body.active === undefined ? existing.active : body.active ? 1 : 0,
      body.password ? bcrypt.hashSync(body.password, 10) : null,
      id,
    );
    res.json(mapUser(getUser(id)));
  });

  return r;
}
