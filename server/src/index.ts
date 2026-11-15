import "./env.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { openDb } from "./db.js";
import { createApp } from "./app.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const dbFile = process.env.DB_PATH ?? path.join(here, "..", "data", "stockflow.db");
const port = Number(process.env.PORT ?? 3001);

const db = openDb(dbFile);

// First boot: make sure someone can sign in.
const userCount = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
if (userCount === 0) {
  const email = process.env.ADMIN_EMAIL ?? "admin@stockflow.local";
  const password = process.env.ADMIN_PASSWORD ?? "admin1234";
  db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')").run(
    "Administrator",
    email,
    bcrypt.hashSync(password, 10),
  );
  console.log(`Created initial admin account: ${email} (change the password after signing in)`);
}

const app = createApp(db, { staticDir: path.join(here, "..", "..", "dist") });
app.listen(port, () => {
  console.log(`StockFlow API listening on http://localhost:${port}`);
});
