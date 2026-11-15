import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { DB } from "../db.js";
import { HttpError, currentUser, requireAuth, signToken, type Role } from "../http.js";

interface UserRow {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  active: number;
}

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "must be at least 8 characters"),
});

export function authRouter(db: DB) {
  const r = Router();

  r.post("/login", (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      throw new HttpError(401, "Invalid email or password");
    }
    if (!user.active) throw new HttpError(403, "This account has been deactivated");
    const authUser = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.json({ token: signToken(authUser), user: authUser });
  });

  r.get("/me", requireAuth, (req, res) => {
    const me = currentUser(req);
    const row = db.prepare("SELECT id, name, email, role, active FROM users WHERE id = ?").get(me.id) as
      | UserRow
      | undefined;
    if (!row || !row.active) throw new HttpError(401, "Account no longer active");
    res.json({ user: { id: row.id, name: row.name, email: row.email, role: row.role } });
  });

  r.post("/password", requireAuth, (req, res) => {
    const me = currentUser(req);
    const { currentPassword, newPassword } = passwordSchema.parse(req.body);
    const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(me.id) as
      | Pick<UserRow, "password_hash">
      | undefined;
    if (!row || !bcrypt.compareSync(currentPassword, row.password_hash)) {
      throw new HttpError(400, "Current password is incorrect");
    }
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(newPassword, 10), me.id);
    res.json({ ok: true });
  });

  return r;
}
