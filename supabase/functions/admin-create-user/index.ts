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
  const caller = createClient(url, publicKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return reply({ error: "Authentication required" }, 401);
  const { data: isAdmin, error: permissionError } = await caller.rpc("is_admin");
  if (permissionError || !isAdmin) return reply({ error: "Active admin required" }, 403);

  let body: { user_id?: string };
  try { body = await req.json(); } catch { return reply({ error: "Invalid JSON body" }, 400); }
  const targetId = String(body.user_id || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId))
    return reply({ error: "A valid target user ID is required" }, 400);
  if (targetId === authData.user.id) return reply({ error: "You cannot delete your own signed-in account" }, 400);

  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: target, error: targetError } = await service.auth.admin.getUserById(targetId);
  if (targetError || !target.user) return reply({ error: "Target user not found" }, 404);

  const { data: targetRoleRow, error: roleError } = await service.from("user_roles").select("role").eq("user_id", targetId).maybeSingle();
  if (roleError) return reply({ error: "Could not verify target user's role" }, 500);
  if (targetRoleRow?.role === "admin") {
    const { data: admins, error: adminsError } = await service.from("user_roles").select("user_id").eq("role", "admin");
    if (adminsError) return reply({ error: "Could not verify remaining Admin accounts" }, 500);
    const adminIds = (admins || []).map((r: { user_id: string }) => r.user_id);
    const { data: activeProfiles, error: profilesError } = await service.from("profiles").select("id").in("id", adminIds).eq("active", true);
    if (profilesError) return reply({ error: "Could not verify remaining active Admin accounts" }, 500);
    if ((activeProfiles || []).length <= 1) return reply({ error: "Cannot delete the last active Admin account. Promote another active user to Admin first." }, 409);
  }

  // Preserve the salesman employee record and its historical business references;
  // only detach its login before deleting auth.users (salesmen.user_id is unique/FK).
  const { error: detachError } = await service.from("salesmen").update({ user_id: null, updated_at: new Date().toISOString() }).eq("user_id", targetId);
  if (detachError) return reply({ error: `Could not detach linked salesman login: ${detachError.message}` }, 409);

  const { error: deleteError } = await service.auth.admin.deleteUser(targetId);
  if (deleteError) return reply({ error: `Could not delete user: ${deleteError.message}` }, 409);
  return reply({ ok: true, user_id: targetId, preserved_business_records: true });
});
