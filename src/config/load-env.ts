import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Load `.env` into process.env if present. Does not override existing vars. */
export function loadEnvFile(path = resolve(process.cwd(), ".env")): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    const key = trimmed.slice(0, i).trim();
    const val = trimmed.slice(i + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = val;
  }
}
