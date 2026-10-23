import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";

Deno.serve(async (req: Request) => {
  const configured = (Deno.env.get("ALLOWED_ORIGIN") || "").split(",").map((v) => v.trim()).filter(Boolean);
  const origin = req.headers.get("Origin") || "";
  const originAllowed = !!origin && configured.includes(origin) && !configured.includes("*");
  const headers = new Headers({
    "Content-Type": "application/json",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
  });
  if (originAllowed) headers.set("Access-Control-Allow-Origin", origin);
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { status: originAllowed ? 204 : 403, headers });
  if (!originAllowed) return reply({ error: "Origin not allowed" }, 403);
  if (req.method !== "POST") return reply({ error: "POST required" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const publicKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publicKey || !serviceKey) return reply({ error: "Server auth configuration is incomplete" }, 500);

  const authorization = req.headers.get("Authorization") || "";
  const caller = createClient(url, publicKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return reply({ error: "Authentication required" }, 401);
  const { data: isAdmin, error: permissionError } = await caller.rpc("is_admin");
  if (permissionError || !isAdmin) return reply({ error: "Only an active Admin can create users" }, 403);

  let body: { display_name?: string; email?: string; temporary_password?: string; role?: string };
  try { body = await req.json(); } catch { return reply({ error: "Invalid JSON body" }, 400); }
  const displayName = String(body.display_name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.temporary_password || "");
  const role = String(body.role || "").trim().toLowerCase();
  if (!displayName) return reply({ error: "Full name is required" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ error: "A valid email address is required" }, 400);
  if (password.length < 12) return reply({ error: "Password must be at least 12 characters" }, 400);
  if (!(["salesman", "manager"] as string[]).includes(role)) return reply({ error: "Role must be Salesman or Manager" }, 400);

  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName, role },
  });
  if (createError || !created.user) return reply({ error: createError?.message || "Could not create login account" }, 409);
  const userId = created.user.id;

  // Upsert safely if the project's auth trigger already created either row.
  const { error: profileError } = await service.from("profiles").upsert({ id: userId, display_name: displayName, active: true, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (profileError) {
    await service.auth.admin.deleteUser(userId);
    return reply({ error: `Login creation rolled back because the profile could not be created: ${profileError.message}` }, 500);
  }
  const { error: roleError } = await service.from("user_roles").upsert({ user_id: userId, role, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (roleError) {
    await service.auth.admin.deleteUser(userId);
    return reply({ error: `Login creation rolled back because the role could not be saved: ${roleError.message}` }, 500);
  }
  return reply({ ok: true, user_id: userId, role, display_name: displayName });
});
