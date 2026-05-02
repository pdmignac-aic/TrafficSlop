/** Normalize values often copy-pasted with quotes, trailing slash, or API subpaths. */
export function getSupabaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return "";
  let u = raw.trim().replace(/^["']|["']$/g, "");
  u = u.replace(/\/+$/, "");
  u = u.replace(/\/(?:rest|auth|storage)\/v1$/, "");
  return u;
}

export function getSupabaseAnonKey(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!raw) return "";
  return raw.trim().replace(/^["']|["']$/g, "");
}

export function getSupabaseServiceRoleKey(): string {
  const raw = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!raw) return "";
  return raw.trim().replace(/^["']|["']$/g, "");
}
