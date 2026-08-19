import { createClient } from "npm:@supabase/supabase-js@2";

type MessageRecord = {
  id: number;
  room_id: string;
  author_id: string;
  text?: string;
  file_name?: string;
};

const encode = (value: string | Uint8Array) => {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

async function firebaseAccessToken(serviceAccount: { client_email: string; private_key: string }) {
  const now = Math.floor(Date.now() / 1000);
  const header = encode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = encode(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const pem = serviceAccount.private_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const keyBytes = Uint8Array.from(atob(pem), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const unsigned = `${header}.${payload}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${encode(new Uint8Array(signature))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new Error(`Firebase authentication failed (${response.status})`);
  return (await response.json()).access_token as string;
}

Deno.serve(async (request) => {
  try {
    const expectedSecret = Deno.env.get("NOTIFICATION_WEBHOOK_SECRET");
    if (expectedSecret && request.headers.get("x-webhook-secret") !== expectedSecret) {
      return new Response("Unauthorized", { status: 401 });
    }
    const payload = await request.json();
    const message = (payload.record || payload) as MessageRecord;
    if (!message.room_id || !message.author_id) return new Response("Ignored", { status: 202 });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const [{ data: author }, { data: memberships }] = await Promise.all([
      supabase.from("profiles").select("name").eq("id", message.author_id).single(),
      supabase.from("room_members").select("user_id").eq("room_id", message.room_id).neq("user_id", message.author_id),
    ]);
    const recipientIds = (memberships || []).map((item) => item.user_id);
    if (!recipientIds.length) return Response.json({ sent: 0 });
    const { data: mutedPreferences, error: preferencesError } = await supabase
      .from("conversation_preferences")
      .select("user_id")
      .eq("room_id", message.room_id)
      .eq("is_muted", true)
      .in("user_id", recipientIds);
    if (preferencesError) throw preferencesError;
    const mutedUserIds = new Set((mutedPreferences || []).map((item) => item.user_id));
    const activeRecipientIds = recipientIds.filter((id) => !mutedUserIds.has(id));
    if (!activeRecipientIds.length) return Response.json({ sent: 0, muted: recipientIds.length });
    const { data: devices, error } = await supabase.from("push_tokens").select("token").in("user_id", activeRecipientIds);
    if (error) throw error;

    const serviceAccount = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON")!);
    const accessToken = await firebaseAccessToken(serviceAccount);
    const body = message.text?.trim() || (message.file_name ? `Sent ${message.file_name}` : "Sent an attachment");
    const results = await Promise.allSettled((devices || []).map(({ token }) =>
      fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: author?.name || "New ChatSpace message", body },
            data: { room_id: message.room_id, title: author?.name || "New message", body },
            android: { priority: "high", notification: { channel_id: "chat_messages", sound: "default" } },
          },
        }),
      })
    ));
    return Response.json({ attempted: results.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Notification failed" }, { status: 500 });
  }
});
