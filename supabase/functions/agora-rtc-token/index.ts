import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { RtcTokenBuilder, RtcRole } from "npm:agora-token@2.0.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function uidFromUuid(uuid: string): number {
  // Stable positive 31-bit UID derived from the authenticated Supabase user id.
  let hash = 2166136261;
  for (const char of uuid.toLowerCase()) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const uid = (hash >>> 0) & 0x7fffffff;
  return uid === 0 ? 1 : uid;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "METHOD_NOT_ALLOWED" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return reply({ error: "AUTH_REQUIRED" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const appId = Deno.env.get("AGORA_APP_ID");
  const appCertificate = Deno.env.get("AGORA_APP_CERTIFICATE");

  if (!supabaseUrl || !supabaseAnonKey) return reply({ error: "SUPABASE_ENV_NOT_CONFIGURED" }, 503);
  if (!appId || !appCertificate) return reply({ error: "AGORA_NOT_CONFIGURED" }, 503);

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });

  const accessToken = authorization.slice("Bearer ".length);
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) return reply({ error: "INVALID_AUTH_TOKEN" }, 401);

  let body: { sessionId?: unknown; intent?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply({ error: "INVALID_JSON" }, 400);
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const intent = body.intent === "publish_audio" ? "publish_audio" : "listen";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
    return reply({ error: "INVALID_SESSION_ID" }, 400);
  }

  // Table SELECT policies can hide a group session before the member joins.
  // The snapshot RPC applies the same membership rules without requiring a prior participant row.
  const { data: snapshot, error: snapshotError } = await supabase.rpc("get_study_session_snapshot", {
    p_session_id: sessionId,
  });
  if (snapshotError || !snapshot) {
    console.warn("agora-rtc-token snapshot authorization failed", snapshotError?.code ?? "NO_SNAPSHOT");
    return reply({ error: "SESSION_ACCESS_DENIED" }, 403);
  }
  if (!snapshot.is_present || !snapshot.participant_id) {
    return reply({ error: "PRESENT_PARTICIPANT_REQUIRED" }, 403);
  }
  if (!snapshot.allow_audio || !["active", "paused"].includes(snapshot.status)) {
    return reply({ error: "AUDIO_NOT_AVAILABLE" }, 409);
  }

  const { data: seat, error: seatError } = await supabase
    .from("study_session_speaker_seats")
    .select("seat_number")
    .eq("session_id", sessionId)
    .eq("participant_id", snapshot.participant_id)
    .maybeSingle();
  if (seatError) {
    console.warn("agora-rtc-token seat lookup failed", seatError.code);
    return reply({ error: "SEAT_LOOKUP_FAILED" }, 500);
  }
  if (intent === "publish_audio" && !seat) return reply({ error: "SPEAKER_SEAT_REQUIRED" }, 403);

  const channelName = `study_${sessionId.replaceAll("-", "")}`;
  const uid = uidFromUuid(user.id);
  const tokenTtlSeconds = 15 * 60;
  const rtcToken = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    uid,
    RtcRole.PUBLISHER,
    tokenTtlSeconds,
    tokenTtlSeconds,
    intent === "publish_audio" ? tokenTtlSeconds : 0,
    0,
    0,
  );

  return reply({
    appId,
    channelName,
    uid,
    token: rtcToken,
    expiresIn: tokenTtlSeconds,
    role: intent,
    audioOnly: true,
    seatNumber: seat?.seat_number ?? null,
  });
});
