import { loadEnv } from "../harness/env";

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Нет ${name} в .env или окружении`);
  return value;
}

export async function supabaseRequest(path: string, init: RequestInit = {}) {
  loadEnv();
  const supabaseUrl = requireEnv("SUPABASE_URL").replace(/\/+$/, "");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const headers = new Headers(init.headers);
  headers.set("apikey", serviceRoleKey);
  if (serviceRoleKey.startsWith("sb_secret_")) {
    headers.delete("Authorization");
  } else {
    headers.set("Authorization", `Bearer ${serviceRoleKey}`);
  }
  headers.set("Content-Type", "application/json");

  return fetch(`${supabaseUrl}/rest/v1/${path.replace(/^\/+/, "")}`, {
    ...init,
    headers,
  });
}
