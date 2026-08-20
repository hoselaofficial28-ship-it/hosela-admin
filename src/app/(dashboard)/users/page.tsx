"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Key, RotateCcw, Save, Shield, UserRound, UsersRound, X } from "lucide-react";
import Toast from "@/components/Toast";

interface Department {
  key: string;
  label: string;
}

interface Feature {
  key: string;
  label: string;
  href: string;
}

interface ManagedUser {
  id: number;
  username: string;
  role: "owner" | "admin";
  department: string | null;
  status: "active" | "inactive";
  name: string | null;
  email: string | null;
  created_at: string;
  permissions: string[];
}

const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  admin_marketplace: ["dashboard", "input", "history", "catatan", "rapat"],
  admin_gudang: ["input", "history", "catatan", "rapat"],
  kepala_gudang: ["dashboard", "history", "tasks", "catatan", "rapat"],
  host_live_streaming: ["catatan", "rapat", "tasks"],
  content_creator: ["catatan", "rapat", "tasks"],
};

const STATUS_CONFIG = {
  active: { label: "Aktif", className: "bg-green-50 text-green-700 border-green-200" },
  inactive: { label: "Nonaktif", className: "bg-red-50 text-red-700 border-red-200" },
};

export default function UsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [resetId, setResetId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    const res = await fetch("/api/users");
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users || []);
      setDepartments(data.departments || []);
      setFeatures(data.features || []);
    }
    setLoading(false);
  }

  function updateUser(id: number, patch: Partial<ManagedUser>) {
    setUsers((prev) => prev.map((user) => user.id === id ? { ...user, ...patch } : user));
  }

  function togglePermission(user: ManagedUser, featureKey: string) {
    const exists = user.permissions.includes(featureKey);
    updateUser(user.id, {
      permissions: exists
        ? user.permissions.filter((permission) => permission !== featureKey)
        : [...user.permissions, featureKey],
    });
  }

  function resetDefault(user: ManagedUser) {
    updateUser(user.id, {
      permissions: user.role === "owner"
        ? features.map((feature) => feature.key)
        : DEFAULT_PERMISSIONS[user.department || ""] || ["catatan", "rapat"],
    });
  }

  async function resetPassword(userId: number) {
    if (!newPassword || newPassword.length < 6) {
      setToast({ message: "Password minimal 6 karakter", type: "error" });
      return;
    }
    setResetting(true);
    const res = await fetch(`/api/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });
    if (res.ok) {
      setToast({ message: "Password berhasil direset", type: "success" });
      setResetId(null);
      setNewPassword("");
    } else {
      const data = await res.json();
      setToast({ message: data.error || "Gagal reset password", type: "error" });
    }
    setResetting(false);
  }

  async function saveUser(user: ManagedUser) {
    setSavingId(user.id);
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        department: user.department,
        status: user.status,
        permissions: user.permissions,
        email: user.email,
      }),
    });

    if (res.ok) {
      setToast({ message: "Akses user disimpan", type: "success" });
      loadUsers();
    } else {
      const data = await res.json();
      setToast({ message: data.error || "Gagal menyimpan user", type: "error" });
    }
    setSavingId(null);
  }

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter((user) => user.status === "active").length,
    inactive: users.filter((user) => user.status === "inactive").length,
  }), [users]);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Users & Akses</h2>
        <p className="text-sm text-gray-500">Kelola akun, bagian kerja, status, dan fitur yang boleh diakses</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat label="Total User" value={stats.total} />
        <Stat label="Aktif" value={stats.active} />
        <Stat label="Nonaktif" value={stats.inactive} />
      </div>

      {loading ? (
        <div className="bg-white rounded-lg border border-gray-100 p-10 text-center text-gray-400">Memuat user...</div>
      ) : users.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-100 p-10 text-center text-gray-400">Belum ada user</div>
      ) : (
        <div className="space-y-3">
          {users.map((user) => {
            const status = STATUS_CONFIG[user.status];
            const owner = user.role === "owner";

            return (
              <div key={user.id} className="bg-white rounded-lg border border-gray-100 shadow-sm p-4">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
                      {owner ? <Shield className="w-5 h-5" /> : <UserRound className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900">{user.name || user.username}</h3>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${status.className}`}>{status.label}</span>
                        {owner && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">Owner</span>}
                      </div>
                      <div className="text-xs text-gray-400">{user.username}{user.email ? ` - ${user.email}` : ""}</div>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-[1fr_190px_140px] gap-2">
                    <input
                      type="email"
                      value={user.email || ""}
                      onChange={(e) => updateUser(user.id, { email: e.target.value || null })}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Email (untuk notifikasi)"
                    />
                    <select
                      value={user.department || ""}
                      onChange={(e) => updateUser(user.id, { department: e.target.value })}
                      disabled={owner}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50 disabled:text-gray-400"
                    >
                      <option value="">Pilih bagian</option>
                      {departments.map((department) => (
                        <option key={department.key} value={department.key}>{department.label}</option>
                      ))}
                    </select>
                    <select
                      value={user.status}
                      onChange={(e) => updateUser(user.id, { status: e.target.value as ManagedUser["status"] })}
                      disabled={owner}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50 disabled:text-gray-400"
                    >
                      <option value="active">Aktif</option>
                      <option value="inactive">Nonaktif</option>
                    </select>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-2">
                  {features.map((feature) => {
                    const checked = owner || user.permissions.includes(feature.key);
                    return (
                      <label
                        key={feature.key}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition ${
                          checked ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-white border-gray-200 text-gray-500"
                        } ${owner ? "opacity-80" : "cursor-pointer"}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={owner}
                          onChange={() => togglePermission(user, feature.key)}
                          className="w-4 h-4 rounded border-gray-300 accent-purple-600"
                        />
                        {feature.label}
                      </label>
                    );
                  })}
                </div>

                {resetId === user.id && (
                  <div className="flex items-center gap-2 pt-3 mt-3 border-t border-gray-100">
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Password baru (min. 6 karakter)"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                    <button
                      onClick={() => resetPassword(user.id)}
                      disabled={resetting}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                    >
                      {resetting ? "..." : "Simpan"}
                    </button>
                    <button
                      onClick={() => { setResetId(null); setNewPassword(""); }}
                      className="p-2 text-gray-400 hover:text-gray-600 transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-4 mt-4 border-t border-gray-50">
                  <div className="text-xs text-gray-400">Terdaftar: {user.created_at}</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setResetId(resetId === user.id ? null : user.id); setNewPassword(""); }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-100 transition"
                    >
                      <Key className="w-3.5 h-3.5" />
                      Reset Password
                    </button>
                    <button
                      onClick={() => resetDefault(user)}
                      disabled={owner}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-50 text-amber-700 text-xs font-medium rounded-lg hover:bg-amber-100 disabled:opacity-40 transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reset default
                    </button>
                    <button
                      onClick={() => saveUser(user)}
                      disabled={savingId === user.id}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition"
                    >
                      {savingId === user.id ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                      Simpan akses
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
        <UsersRound className="w-4 h-4 text-purple-600" />
        {label}
      </div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
    </div>
  );
}
