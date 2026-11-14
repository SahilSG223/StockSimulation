/**
 * Live embedding smoke test. Usage (from repo root):
 *   node scripts/smoke-embed.mjs
 * Requires OPENAI_API_KEY in .env (gitignored).
 */
import { readFileSync, existsSync } from "node:fs";
import OpenAI from "openai";

function loadEnv() {
  const env = { ...process.env };
  if (!existsSync(".env")) return env;
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k && env[k] === undefined) env[k] = v;
  }
  return env;
}

const env = loadEnv();
if (!env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY in .env");
  process.exit(1);
}

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const model = env.EMBEDDING_MODEL || "text-embedding-3-small";
const res = await client.embeddings.create({
  model,
  input: "semiconductor momentum in a bull regime",
  dimensions: 1536,
});

console.log(
  JSON.stringify({
    model,
    dims: res.data[0].embedding.length,
    ok: true,
  }),
);
