import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: cors }); }
function fail(message: string, status = 400) { return response({ error: message }, status); }
function statusOf(row: any) {
  if (row.revoked_at) return "revoked";
  if (row.used_at) return "redeemed";
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return "expired";
  return "available";
}
function randomCode(length: number, prefix: string) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = prefix;
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}
async function hashCode(code: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code.toUpperCase().trim()));
  return Array.from(new Uint8Array(digest)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function audit(actor: string, action: string, fields: Record<string, unknown> = {}) {
  const { error } = await admin.from("code_audit_logs").insert({ actor_id: actor, action, ...fields });
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("Method not allowed", 405);
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return fail("Authentication required", 401);
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const user = authData.user;
  if (authError || !user) return fail("Invalid session", 401);
  const { data: allowed, error: adminCheckError } = await admin.from("code_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (adminCheckError) return fail("Admin authorization unavailable", 503);
  if (!allowed) return fail("Administrator access required", 403);
  try {
    const body = await req.json();
    const action = String(body.action || "");
    if (action === "overview") {
      const [codes, batches, logs, groups] = await Promise.all([
        admin.from("invite_codes").select("id,group_id,batch_id,code_label,created_by,created_at,expires_at,used_by,used_at,revoked_at,internal_note"),
        admin.from("code_batches").select("id,name,description,purpose,group_id,code_length,prefix,expires_at,created_by,created_at"),
        admin.from("code_audit_logs").select("id,actor_id,action,group_id,batch_id,invite_code_id,metadata,created_at").order("created_at", { ascending: false }).limit(20),
        admin.from("study_groups").select("id,name,created_at,created_by").order("created_at", { ascending: false }),
      ]);
      for (const r of [codes,batches,logs,groups]) if (r.error) throw r.error;
      const all = codes.data || [];
      const summary = { total: all.length, available: 0, redeemed: 0, expired: 0, revoked: 0 };
      for (const c of all) summary[statusOf(c) as keyof typeof summary]++;
      const days = new Map<string, number>();
      for (const c of all) { const day = String(c.created_at).slice(0,10); days.set(day, (days.get(day)||0)+1); }
      await audit(user.id, "admin_access", { metadata: { feature: "invite_code_dashboard" } });
      return response({ summary, activity: [...days.entries()].sort().slice(-30).map(([date,count])=>({date,count})), recent: logs.data, batches: batches.data, groups: groups.data });
    }
    if (action === "list_codes") {
      const page = Math.max(1, Number(body.page) || 1), pageSize = Math.min(100, Math.max(10, Number(body.pageSize)||25));
      let q = admin.from("invite_codes").select("id,group_id,batch_id,code_label,created_by,created_at,expires_at,used_by,used_at,revoked_at,internal_note", { count: "exact" }).order("created_at", { ascending: false });
      if (body.batchId) q = q.eq("batch_id", body.batchId);
      if (body.groupId) q = q.eq("group_id", body.groupId);
      if (body.dateFrom) q = q.gte("created_at", String(body.dateFrom)+"T00:00:00.000Z");
      if (body.dateTo) q = q.lte("created_at", String(body.dateTo)+"T23:59:59.999Z");
      const now = new Date().toISOString();
      if (body.status === "redeemed") q = q.not("used_at","is",null);
      if (body.status === "revoked") q = q.not("revoked_at","is",null);
      if (body.status === "expired") q = q.is("used_at",null).is("revoked_at",null).not("expires_at","is",null).lte("expires_at",now);
      if (body.status === "available") q = q.is("used_at",null).is("revoked_at",null).or("expires_at.is.null,expires_at.gt."+now);
      if (body.search) q = q.or("code_label.ilike.%"+String(body.search).replace(/[%,()]/g,"")+"%,internal_note.ilike.%"+String(body.search).replace(/[%,()]/g,"")+"%");
      const { data, error, count } = await q.range((page-1)*pageSize, page*pageSize-1);
      if (error) throw error;
      return response({ items: (data||[]).map((r)=>({...r,status:statusOf(r)})), total:count||0, page, pageSize });
    }
    if (action === "create_group") {
      const name = String(body.name || "").trim();
      if (name.length < 2 || name.length > 80) return fail("Group name must be 2 to 80 characters");
      const { data, error } = await admin.rpc("admin_create_study_group", { p_name: name, p_creator: user.id });
      if (error) throw error;
      return response({ group: data });
    }
    if (action === "generate") {
      const groupId = String(body.groupId||"");
      const amount = Math.max(1, Math.min(200, Number(body.count)||1));
      const codeLength = Math.max(12, Math.min(32, Number(body.codeLength)||16));
      const prefix = String(body.prefix||"").toUpperCase();
      if (!/^[A-Z0-9]{0,8}$/.test(prefix) || prefix.length >= codeLength) return fail("Invalid prefix");
      const name = String(body.batchName||"").trim();
      if (!name || name.length>100) return fail("Batch name is required (max 100 characters)");
      const { data: group, error: ge } = await admin.from("study_groups").select("id").eq("id",groupId).maybeSingle();
      if (ge) throw ge; if (!group) return fail("Choose an existing group");
      const expiryDate = body.expiresAt ? new Date(body.expiresAt) : null;
      if (expiryDate && !Number.isFinite(expiryDate.getTime())) return fail("Invalid expiry date");
      const expiresAt = expiryDate ? expiryDate.toISOString() : null;
      const { data: batch, error: be } = await admin.from("code_batches").insert({ group_id:groupId,name,description:String(body.description||"").slice(0,500),purpose:String(body.purpose||"").slice(0,120),code_length:codeLength,prefix,expires_at:expiresAt,created_by:user.id }).select().single();
      if (be) throw be;
      const generated: string[] = [];
      const records: any[] = [];
      for (let i=0;i<amount;i++) {
        const code = randomCode(codeLength-prefix.length, prefix);
        generated.push(code);
        records.push({ group_id:groupId,code_hash:"\\x"+await hashCode(code),created_by:user.id,expires_at:expiresAt,batch_id:batch.id,code_label:String(body.label||"").slice(0,120),internal_note:String(body.note||"").slice(0,1000) });
      }
      const { data: inserted, error: ie } = await admin.from("invite_codes").insert(records).select("id");
      if (ie) { await admin.from("code_batches").delete().eq("id",batch.id); throw ie; }
      await audit(user.id,"batch_generated",{group_id:groupId,batch_id:batch.id,metadata:{count:amount,name}});
      return response({ batch, codes:generated, codeIds:inserted?.map((x)=>x.id)||[] });
    }
    if (action === "revoke_code") {
      const id = String(body.codeId||"");
      const { data: row, error } = await admin.from("invite_codes").select("id,group_id,batch_id,used_at,revoked_at").eq("id",id).maybeSingle();
      if (error) throw error; if (!row) return fail("Code not found",404);
      if (row.used_at) return fail("Redeemed codes cannot be revoked");
      if (row.revoked_at) return fail("Code is already revoked");
      const { error: updateError } = await admin.from("invite_codes").update({ revoked_at:new Date().toISOString() }).eq("id",id).is("used_at",null).is("revoked_at",null);
      if (updateError) throw updateError;
      await audit(user.id,"code_revoked",{group_id:row.group_id,batch_id:row.batch_id,invite_code_id:id});
      return response({ success:true });
    }
    if (action === "revoke_batch") {
      const id = String(body.batchId||"");
      const { data: rows, error } = await admin.from("invite_codes").select("id,group_id").eq("batch_id",id).is("used_at",null).is("revoked_at",null);
      if (error) throw error;
      const ids=(rows||[]).map((r)=>r.id);
      if (ids.length) {
        const { error: updateError } = await admin.from("invite_codes").update({ revoked_at:new Date().toISOString() }).in("id",ids).is("used_at",null).is("revoked_at",null);
        if (updateError) throw updateError;
      }
      await audit(user.id,"batch_revoked",{batch_id:id,metadata:{revoked_count:ids.length}});
      return response({ success:true, revokedCount:ids.length });
    }
    if (action === "update_note") {
      const id=String(body.codeId||""), note=String(body.note||"").slice(0,1000);
      const { data: row,error }=await admin.from("invite_codes").update({internal_note:note}).eq("id",id).select("id,group_id,batch_id").maybeSingle();
      if(error) throw error; if(!row) return fail("Code not found",404);
      await audit(user.id,"code_note_updated",{group_id:row.group_id,batch_id:row.batch_id,invite_code_id:id});
      return response({success:true});
    }
    if (action === "list_admins") {
      const { data,error }=await admin.from("code_admins").select("user_id,added_by,created_at").order("created_at");
      if(error) throw error;
      const ids=(data||[]).map((a)=>a.user_id);
      const users=await Promise.all(ids.map(async (id)=>{ const {data}=await admin.auth.admin.getUserById(id); return {user_id:id,email:data.user?.email||null}; }));
      return response({admins:(data||[]).map((a)=>({...a,email:users.find((u)=>u.user_id===a.user_id)?.email||null}))});
    }
    if (action === "add_admin") {
      const id=String(body.userId||"");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return fail("Enter a valid Supabase Auth UUID");
      const {data: target,error:te}=await admin.auth.admin.getUserById(id);
      if(te||!target.user) return fail("Auth user not found",404);
      const {error}=await admin.rpc("admin_add_code_admin",{p_user_id:id,p_actor:user.id});
      if(error) { if(error.code==="23505") return fail("This user is already an administrator"); if(error.message==="Auth user not found") return fail("Auth user not found",404); throw error; }
      return response({success:true});
    }
    if (action === "revoke_admin") {
      const id=String(body.userId||"");
      const {error}=await admin.rpc("admin_revoke_code_admin",{p_user_id:id,p_actor:user.id});
      if(error) {
        if(error.message==="You cannot revoke your own administrator access"||error.message==="Cannot revoke the last administrator") return fail(error.message);
        if(error.message==="Administrator not found") return fail(error.message,404);
        throw error;
      }
      return response({success:true});
    }
    if (action === "audit") {
      const page=Math.max(1,Number(body.page)||1), size=Math.min(100,Math.max(10,Number(body.pageSize)||50));
      let q=admin.from("code_audit_logs").select("id,actor_id,action,group_id,batch_id,invite_code_id,metadata,created_at",{count:"exact"}).order("created_at",{ascending:false});
      if(body.actionFilter) q=q.eq("action",body.actionFilter);
      const {data,error,count}=await q.range((page-1)*size,page*size-1);
      if(error) throw error; return response({items:data||[],total:count||0,page,pageSize:size});
    }
    if (action === "batches") {
      const {data,error}=await admin.from("code_batches").select("*").order("created_at",{ascending:false});
      if(error) throw error;
      const {data:codes,error:ce}=await admin.from("invite_codes").select("id,batch_id,used_at,expires_at,revoked_at");
      if(ce) throw ce;
      const rows=data||[];
      return response({items:rows.map((b)=>{const cs=(codes||[]).filter((c)=>c.batch_id===b.id);const summary={total:cs.length,available:0,redeemed:0,expired:0,revoked:0};for(const c of cs)summary[statusOf(c) as keyof typeof summary]++;return {...b,summary};})});
    }
    return fail("Unknown action");
  } catch (e) {
    console.error("invite-code-admin operation failed", e);
    return fail("Administrative operation failed",500);
  }
});
