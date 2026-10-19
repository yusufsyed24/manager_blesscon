import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";

Deno.serve(async (req: Request) => {
  // Configure ALLOWED_ORIGIN (single origin) or ALLOWED_ORIGINS (comma-separated
  // exact origins). Do not use a wildcard: this function exposes registered emails.
  const configuredOrigins = Deno.env.get("ALLOWED_ORIGINS") || Deno.env.get("ALLOWED_ORIGIN") || "";
  const allowedOrigins = configuredOrigins
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter((value) => value.length > 0 && value !== "*");
  const origin = (req.headers.get("Origin") || "").trim().replace(/\/$/, "");
  const originAllowed = Boolean(origin) && allowedOrigins.includes(origin);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
  // Only echo an origin that exactly matches the configured allowlist.
  if (originAllowed) headers["Access-Control-Allow-Origin"] = origin;
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

  // Browsers send OPTIONS before POST. Return a successful preflight for approved
  // origins, before authentication (preflight requests do not carry the user JWT).
  if (req.method === "OPTIONS") {
    return new Response(null, { status: originAllowed ? 204 : 403, headers });
  }
  if (!originAllowed) return reply({ error: "Origin not allowed" }, 403);
  if (req.method !== "POST") return reply({ error: "POST required" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const publicKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publicKey || !serviceKey) return reply({ error: "Server auth configuration is incomplete" }, 500);
  const authorization = req.headers.get("Authorization") || "";
  const caller = createClient(url, publicKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return reply({ error: "Authentication required" }, 401);
  const { data: isAdmin, error: permissionError } = await caller.rpc("is_admin");
  if (permissionError || !isAdmin) return reply({ error: "Active admin required" }, 403);

  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const users: { user_id: string; email: string }[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 500 });
    if (error) return reply({ error: "Could not retrieve registered login emails" }, 500);
    for (const account of data.users) users.push({ user_id: account.id, email: account.email || "" });
    if (data.users.length < 500) break;
  }
  return reply({ users });
});
