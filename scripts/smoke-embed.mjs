
import { readFileSync } from 'fs';
import OpenAI from 'openai';

function loadEnv() {
  const env = {};
  for (const line of readFileSync('.env','utf8').split(/\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    env[line.slice(0,i).trim()] = line.slice(i+1).trim();
  }
  return env;
}
const env = loadEnv();
const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const model = env.EMBEDDING_MODEL || 'text-embedding-3-small';
const res = await client.embeddings.create({ model, input: 'semiconductor momentum', dimensions: 1536 });
console.log(JSON.stringify({ model, dims: res.data[0].embedding.length, ok: true }));
