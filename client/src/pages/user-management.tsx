import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserPlus, RotateCcw, UserX, Users } from "lucide-react";

type UserRole = "admin" | "manager" | "staff";

interface CompanyUserRecord {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  entityId: number;
  isActive?: boolean;
}

const roleBadgeVariant: Record<UserRole, "default" | "secondary" | "outline"> = {
  admin: "default",
  manager: "secondary",
  staff: "outline",
};

export default function UserManagement() {
  const { getUser } = useCompanyAuth();
  const { toast } = useToast();
  const currentUser = getUser();
  const isAdmin = currentUser?.role === "admin";

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<CompanyUserRecord | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [addForm, setAddForm] = useState({ username: "", fullName: "", password: "", role: "staff" as UserRole });

  const { data: users, isLoading } = useQuery<CompanyUserRecord[]>({
    queryKey: ["/api/company/users"],
  });

  const createUserMutation = useMutation({
    mutationFn: (data: typeof addForm) => apiRequest("POST", "/api/company/users", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/users"] });
      setShowAddDialog(false);
      setAddForm({ username: "", fullName: "", password: "", role: "staff" });
      toast({ title: "User created", description: "New staff account is ready" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/company/users/${userId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/users"] });
      setShowResetDialog(false);
      setSelectedUser(null);
      setNewPassword("");
      toast({ title: "Updated", description: "User account updated successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function openReset(user: CompanyUserRecord) {
    setSelectedUser(user);
    setShowResetDialog(true);
  }

  function handleDeactivate(user: CompanyUserRecord) {
    if (!confirm(`Deactivate ${user.fullName}? They will no longer be able to log in.`)) return;
    updateUserMutation.mutate({ userId: user.id, data: { isActive: false } });
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Admin access required</p>
            <p className="text-xs mt-1">User management is only available to company administrators</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-usermgmt-title">User Management</h1>
          <p className="text-sm text-muted-foreground">Manage staff accounts for your company</p>
        </div>
        <Button onClick={() => setShowAddDialog(true)} data-testid="button-add-user">
          <UserPlus className="w-4 h-4 mr-2" />
          Add User
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Staff Accounts</CardTitle>
          <CardDescription>{users?.length ?? 0} account{users?.length !== 1 ? "s" : ""}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading users...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(users ?? []).map((user) => (
                  <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                    <TableCell className="font-medium" data-testid={`text-user-name-${user.id}`}>
                      {user.fullName}
                      {user.id === currentUser?.id && (
                        <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground" data-testid={`text-user-username-${user.id}`}>
                      {user.username}
                    </TableCell>
                    <TableCell>
                      <Badge variant={roleBadgeVariant[user.role] ?? "outline"} data-testid={`badge-role-${user.id}`}>
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openReset(user)}
                          data-testid={`button-reset-${user.id}`}
                        >
                          <RotateCcw className="w-3 h-3 mr-1" />
                          Reset Password
                        </Button>
                        {user.id !== currentUser?.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeactivate(user)}
                            disabled={updateUserMutation.isPending}
                            data-testid={`button-deactivate-${user.id}`}
                          >
                            <UserX className="w-3 h-3 mr-1" />
                            Deactivate
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(!users || users.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No staff accounts yet. Click "Add User" to create one.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Staff Account</DialogTitle>
            <DialogDescription>Create a new user account for your company</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); createUserMutation.mutate(addForm); }}
            className="space-y-4"
          >
            <div className="space-y-1">
              <Label>Full Name</Label>
              <Input
                value={addForm.fullName}
                onChange={(e) => setAddForm({ ...addForm, fullName: e.target.value })}
                placeholder="Jane Smith"
                required
                data-testid="input-add-fullname"
              />
            </div>
            <div className="space-y-1">
              <Label>Username</Label>
              <Input
                value={addForm.username}
                onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
                placeholder="jane.smith"
                required
                data-testid="input-add-username"
              />
            </div>
            <div className="space-y-1">
              <Label>Password</Label>
              <Input
                type="password"
                value={addForm.password}
                onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                placeholder="••••••••"
                required
                minLength={6}
                data-testid="input-add-password"
              />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Select
                value={addForm.role}
                onValueChange={(v) => setAddForm({ ...addForm, role: v as UserRole })}
              >
                <SelectTrigger data-testid="select-add-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
              <Button
                type="submit"
                disabled={createUserMutation.isPending || !addForm.username || !addForm.fullName || !addForm.password}
                data-testid="button-create-user"
              >
                {createUserMutation.isPending ? "Creating..." : "Create Account"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for {selectedUser?.fullName}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (selectedUser) updateUserMutation.mutate({ userId: selectedUser.id, data: { password: newPassword } });
            }}
            className="space-y-4"
          >
            <div className="space-y-1">
              <Label>New Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                data-testid="input-reset-password"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setShowResetDialog(false)}>Cancel</Button>
              <Button
                type="submit"
                disabled={updateUserMutation.isPending || newPassword.length < 6}
                data-testid="button-confirm-reset"
              >
                {updateUserMutation.isPending ? "Saving..." : "Reset Password"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
