import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { ...cors, "cache-control": "no-store" } });

const randomSecret = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};
const hash = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await request.json();
    const action = body.action as string;
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    if (action === "start") {
      // Keep abandoned QR sessions from accumulating indefinitely.
      await admin.from("web_link_sessions").delete().lt("expires_at", new Date().toISOString());
      const approvalSecret = randomSecret();
      const pollSecret = randomSecret();
      const expiresAt = new Date(Date.now() + 75_000).toISOString();
      const { data, error } = await admin.from("web_link_sessions").insert({
        approval_secret_hash: await hash(approvalSecret),
        poll_secret_hash: await hash(pollSecret),
        expires_at: expiresAt,
      }).select("id").single();
      if (error) throw error;
      return json({
        session_id: data.id,
        approval_secret: approvalSecret,
        poll_secret: pollSecret,
        expires_at: expiresAt,
      });
    }

    if (action === "approve") {
      const authorization = request.headers.get("authorization") || "";
      const jwt = authorization.replace(/^Bearer\s+/i, "");
      if (!jwt || jwt.startsWith("sb_")) return json({ error: "Sign in on your phone first" }, 401);
      const { data: userData, error: userError } = await admin.auth.getUser(jwt);
      if (userError || !userData.user?.email) return json({ error: "Your phone session expired" }, 401);

      const { session_id: sessionId, approval_secret: approvalSecret } = body;
      const { data: session, error: sessionError } = await admin
        .from("web_link_sessions")
        .select("id, approval_secret_hash, expires_at, consumed_at, approved_user_id")
        .eq("id", sessionId)
        .maybeSingle();
      if (sessionError) throw sessionError;
      if (!session || session.consumed_at || new Date(session.expires_at) <= new Date()) {
        return json({ error: "This QR code expired. Refresh the web page." }, 410);
      }
      if (session.approved_user_id) return json({ error: "This QR code was already approved" }, 409);
      if (session.approval_secret_hash !== await hash(String(approvalSecret || ""))) {
        return json({ error: "Invalid QR code" }, 403);
      }

      const { data: link, error: linkError } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: userData.user.email,
      });
      if (linkError) throw linkError;
      const tokenHash = link.properties?.hashed_token;
      if (!tokenHash) throw new Error("Could not create a browser session token");
      const { error: updateError } = await admin.from("web_link_sessions").update({
        approved_user_id: userData.user.id,
        login_token_hash: tokenHash,
      }).eq("id", session.id).is("approved_user_id", null);
      if (updateError) throw updateError;
      return json({ approved: true });
    }

    if (action === "poll") {
      const { session_id: sessionId, poll_secret: pollSecret } = body;
      const { data: session, error } = await admin
        .from("web_link_sessions")
        .select("id, poll_secret_hash, login_token_hash, expires_at, consumed_at")
        .eq("id", sessionId)
        .maybeSingle();
      if (error) throw error;
      if (!session || session.poll_secret_hash !== await hash(String(pollSecret || ""))) {
        return json({ error: "Invalid linking session" }, 403);
      }
      if (session.consumed_at || new Date(session.expires_at) <= new Date()) {
        return json({ status: "expired" }, 410);
      }
      if (!session.login_token_hash) return json({ status: "pending" }, 202);

      // Deleting and returning the row makes consumption atomic: two browser polls
      // can never receive the same login token.
      const { data: consumed, error: consumeError } = await admin
        .from("web_link_sessions")
        .delete()
        .eq("id", session.id)
        .eq("poll_secret_hash", session.poll_secret_hash)
        .not("login_token_hash", "is", null)
        .select("login_token_hash")
        .maybeSingle();
      if (consumeError) throw consumeError;
      if (!consumed?.login_token_hash) return json({ status: "expired" }, 410);
      return json({ status: "approved", token_hash: consumed.login_token_hash });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Device linking failed" }, 500);
  }
});
