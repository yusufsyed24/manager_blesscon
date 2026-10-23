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
  if (Number(req.headers.get("Content-Length") || 0) > 12000)
    return reply({ error: "Request too large" }, 413);
  const url = Deno.env.get("SUPABASE_URL")!,
    publicKey =
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
      Deno.env.get("SUPABASE_ANON_KEY")!,
    serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization") || "";
  const caller = createClient(url, publicKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
    error: authError,
  } = await caller.auth.getUser();
  if (authError || !user)
    return reply({ error: "Authentication required" }, 401);
  const { data: isAdmin, error: permissionError } =
    await caller.rpc("is_admin");
  if (permissionError || !isAdmin)
    return reply({ error: "Active admin required" }, 403);
  const service = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  let createdId: string | undefined;
  let requestId: string | undefined;
  try {
    const text = await req.text();
    if (text.length > 12000) return reply({ error: "Request too large" }, 413);
    const b = JSON.parse(text);
    const email = String(b.email || "")
        .trim()
        .toLowerCase(),
      name = String(b.display_name || "").trim(),
      password = String(b.temporary_password || ""),
      role = String(b.role || "salesman");
    requestId = String(b.request_id || "");
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        requestId,
      ) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      name.length < 2 ||
      name.length > 120 ||
      password.length < 12 ||
      password.length > 128 ||
      !["admin", "manager", "salesman", "user"].includes(role)
    )
      return reply(
        {
          error:
            "Valid request ID, name, email, role and 12–128 character password required",
        },
        400,
      );
    const { data: prior, error: priorError } = await service
      .from("admin_user_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();
    if (priorError) throw priorError;
    if (prior) {
      if (prior.actor_id !== user.id || prior.email !== email)
        return reply({ error: "Request ID conflict" }, 409);
      if (prior.status === "complete")
        return reply({ user_id: prior.created_user_id, email });
      return reply(
        {
          error:
            "Request is already being processed. Check Users before trying again.",
        },
        409,
      );
    }
    const { error: reserveError } = await service
      .from("admin_user_requests")
      .insert({ id: requestId, actor_id: user.id, email });
    if (reserveError)
      return reply(
        { error: "Duplicate request; check Users before retrying" },
        409,
      );
    if (b.salesman_id) {
      const { data: s, error } = await service
        .from("salesmen")
        .select("id,user_id,active,deleted_at")
        .eq("id", String(b.salesman_id))
        .single();
      if (error || !s || s.user_id || !s.active || s.deleted_at)
        throw Error("Salesman is inactive, missing or already linked");
    }
    const { data: created, error: createError } =
      await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: name, must_change_password: true },
      });
    if (createError || !created.user)
      throw createError || Error("User creation failed");
    createdId = created.user.id;
    const { error: provisionError } = await caller.rpc("apply_command", {
      op_id: requestId,
      kind: "user.provision",
      data: {
        user_id: createdId,
        display_name: name,
        role,
        salesman_id: b.salesman_id || null,
      },
    });
    if (provisionError) throw provisionError;
    return reply({ user_id: createdId, email, display_name: name });
  } catch (e) {
    if (createdId) {
      await service
        .from("salesmen")
        .update({ user_id: null })
        .eq("user_id", createdId);
      await service.auth.admin.deleteUser(createdId);
    }
    if (requestId)
      await service
        .from("admin_user_requests")
        .delete()
        .eq("id", requestId)
        .eq("status", "pending");
    return reply(
      { error: e instanceof Error ? e.message : "Could not create login" },
      400,
    );
  }
});
