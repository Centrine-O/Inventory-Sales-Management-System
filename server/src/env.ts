// Imported first by index.ts so variables are set before other modules read them.
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
for (const file of [path.join(root, ".env"), path.join(root, "server", ".env")]) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* no such file */
  }
}
