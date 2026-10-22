import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";

Deno.serve(async (req: Request) => {
  // ALLOWED_ORIGINS (comma-separated) or ALLOWED_ORIGIN: exact origins only, no wildcard.
  const configuredOrigins = Deno.env.get("ALLOWED_ORIGINS") || Deno.env.get("ALLOWED_ORIGIN") || "";
  const allowedOrigins = configuredOrigins.split(",").map((v) => v.trim().replace(/\/$/, "")).filter((v) => v.length > 0 && v !== "*");
  const origin = (req.headers.get("Origin") || "").trim().replace(/\/$/, "");
  const originAllowed = Boolean(origin) && allowedOrigins.includes(origin);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Vary: "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
  if (originAllowed) headers["Access-Control-Allow-Origin"] = origin;
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  // Preflight carries no JWT; answer it before any auth check.
  if (req.method === "OPTIONS") return new Response(null, { status: originAllowed ? 204 : 403, headers });
  if (!originAllowed) return reply({ error: "Origin not allowed. Set the ALLOWED_ORIGIN secret to this site's exact origin." }, 403);
  if (req.method !== "POST") return reply({ error: "POST required" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const publicKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publicKey || !serviceKey) return reply({ error: "Server auth configuration is incomplete" }, 500);
  const auth = req.headers.get("Authorization") || "";
  const caller = createClient(url, publicKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return reply({ error: "Authentication required" }, 401);
  const { data: isAdmin, error: permissionError } = await caller.rpc("is_admin");
  if (permissionError || !isAdmin) return reply({ error: "Active admin required" }, 403);
  let body: { user_id?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Invalid JSON body" }, 400);
  }
  const targetId = String(body.user_id || "").trim();
  const password = String(body.password || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId))
    return reply({ error: "A valid target user ID is required" }, 400);
  if (targetId === authData.user.id) return reply({ error: "Admins can reset other users, not their own password, here" }, 400);
  if (password.length < 12 || password.length > 128)
    return reply({ error: "Password must be 12–128 characters" }, 400);
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: target, error: targetError } = await service.auth.admin.getUserById(targetId);
  if (targetError || !target.user) return reply({ error: "Target user not found" }, 404);
  const { error: updateError } = await service.auth.admin.updateUserById(targetId, {
    password,
  });
  if (updateError) return reply({ error: updateError.message }, 400);
  return reply({ ok: true, user_id: targetId });
});
