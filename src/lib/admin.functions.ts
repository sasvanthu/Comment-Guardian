import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

export interface AdminUserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  roles: ("admin" | "user")[];
  created_at: string;
  last_sign_in_at: string | null;
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ users: AdminUserRow[] }> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: authUsers, error: aErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (aErr) throw new Error(aErr.message);

    const { data: profiles } = await supabaseAdmin.from("profiles").select("id, display_name, email");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");

    const profById = new Map((profiles ?? []).map((p) => [p.id, p]));
    const rolesById = new Map<string, ("admin" | "user")[]>();
    for (const r of roles ?? []) {
      const arr = rolesById.get(r.user_id) ?? [];
      arr.push(r.role as "admin" | "user");
      rolesById.set(r.user_id, arr);
    }

    const users: AdminUserRow[] = authUsers.users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      display_name: profById.get(u.id)?.display_name ?? null,
      roles: rolesById.get(u.id) ?? [],
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
    }));
    users.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    return { users };
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      email: z.string().email(),
      password: z.string().min(6).max(72),
      display_name: z.string().max(80).optional(),
      role: z.enum(["admin", "user"]).default("user"),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: data.display_name ?? data.email.split("@")[0] },
    });
    if (error) throw new Error(error.message);
    const newId = created.user.id;

    // Trigger creates default 'user' role; if admin requested, add it
    if (data.role === "admin") {
      const { error: rErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: newId, role: "admin" });
      if (rErr) throw new Error(rErr.message);
    }
    return { id: newId };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    if (data.user_id === context.userId) throw new Error("You cannot delete your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      user_id: z.string().uuid(),
      role: z.enum(["admin", "user"]),
      grant: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.user_id, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      if (data.user_id === context.userId && data.role === "admin") {
        throw new Error("You cannot revoke your own admin role");
      }
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.user_id)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
