

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2, UserPlus, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { listUsers, createUser, deleteUser, setUserRole, AdminUserRow } from "@/lib/admin.functions";
import { formatDistanceToNow } from "date-fns";

export default AdminPage;

function AdminPage() {
  const { isAdmin, loading } = useAuth();
  const list = listUsers;
  const create = createUser;
  const del = deleteUser;
  const setRole = setUserRole;
  const qc = useQueryClient();

  const usersQ = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => list(),
    enabled: isAdmin,
  });

  const createMu = useMutation({
    mutationFn: (data: { email: string; password: string; display_name?: string; role: "admin" | "user" }) =>
      create({ data }),
    onSuccess: () => { toast.success("User created"); qc.invalidateQueries({ queryKey: ["admin", "users"] }); setOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create"),
  });
  const delMu = useMutation({
    mutationFn: (user_id: string) => del({ data: { user_id } }),
    onSuccess: () => { toast.success("User deleted"); qc.invalidateQueries({ queryKey: ["admin", "users"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });
  const roleMu = useMutation({
    mutationFn: (v: { user_id: string; role: "admin" | "user"; grant: boolean }) => setRole({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "users"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRoleVal] = useState<"admin" | "user">("user");

  if (loading) return <Layout><p className="text-muted-foreground">Loading…</p></Layout>;
  if (!isAdmin) {
    return (
      <Layout>
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <h1 className="text-lg font-semibold">Admin access required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account doesn't have the admin role yet. Promote your account from the database to access this page.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User management</h1>
          <p className="text-sm text-muted-foreground">Create, delete, and assign roles to TrustLens users.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><UserPlus className="mr-2 h-4 w-4" />New user</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create user</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Display name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Temporary password</Label><Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} /></div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRoleVal(v as "admin" | "user")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={createMu.isPending || !email || password.length < 6}
                onClick={() => createMu.mutate({ email, password, display_name: name || undefined, role })}
              >
                {createMu.isPending ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last sign-in</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usersQ.isLoading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>}
            {(usersQ.data?.users as AdminUserRow[] | undefined)?.map((u: AdminUserRow) => {
              const isAdminUser = u.roles.includes("admin");
              return (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.display_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {u.roles.map((r: string) => <Badge key={r} variant={r === "admin" ? "default" : "secondary"}>{r}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(u.created_at), { addSuffix: true })}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.last_sign_in_at ? formatDistanceToNow(new Date(u.last_sign_in_at), { addSuffix: true }) : "Never"}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => roleMu.mutate({ user_id: u.id, role: "admin", grant: !isAdminUser })}
                      title={isAdminUser ? "Revoke admin" : "Grant admin"}
                    >
                      {isAdminUser ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => { if (confirm(`Delete ${u.email}?`)) delMu.mutate(u.id); }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Layout>
  );
}
