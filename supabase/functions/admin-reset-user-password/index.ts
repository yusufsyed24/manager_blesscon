import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";

Deno.serve(async (req: Request) => {
  const allowed = Deno.env.get("ALLOWED_ORIGIN") || "";
  const origin = req.headers.get("Origin") || "";
  const headers = {
    "Content-Type": "application/json",
    Vary: "Origin",
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
  };
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (!allowed || allowed === "*" || origin !== allowed)
    return reply({ error: "Origin not allowed" }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
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
  let body: { user_id?: string; temporary_password?: string };
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Invalid JSON body" }, 400);
  }
  const targetId = String(body.user_id || "").trim();
  const password = String(body.temporary_password || "");
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
