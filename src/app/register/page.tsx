"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

const DEPARTMENTS = [
  { key: "admin_marketplace", label: "Admin Marketplace" },
  { key: "admin_gudang", label: "Admin Gudang" },
  { key: "kepala_gudang", label: "Kepala Gudang" },
  { key: "host_live_streaming", label: "Host Live Streaming" },
  { key: "content_creator", label: "Content Creator" },
];

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ username: "", password: "", name: "", email: "", department: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Pendaftaran gagal");
        return;
      }

      setSuccess(data.message || "Akun berhasil didaftarkan. Mengarahkan ke dashboard.");
      setForm({ username: "", password: "", name: "", email: "", department: "" });
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 700);
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <BrandMark className="mx-auto mb-4 h-16 w-16 rounded-2xl" iconClassName="h-8 w-8" />
          <h1 className="text-2xl font-bold text-gray-900">Daftar Akun</h1>
          <p className="text-gray-500 mt-1">Buat akun Hosela Notion</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 border border-red-200">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-50 text-green-700 text-sm rounded-lg p-3 border border-green-200">
              {success}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              placeholder="Nama kamu"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              placeholder="Minimal 3 karakter"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-gray-400 font-normal">(untuk pengingat)</span></label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              placeholder="email@contoh.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bagian</label>
            <select
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
              required
            >
              <option value="">Pilih bagian</option>
              {DEPARTMENTS.map((department) => (
                <option key={department.key} value={department.key}>{department.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              placeholder="Minimal 6 karakter"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition"
          >
            {loading ? "Mendaftar..." : "Daftar"}
          </button>

          <p className="text-sm text-center text-gray-500">
            Sudah punya akun?{" "}
            <Link href="/login" className="text-blue-600 font-medium hover:text-blue-700">Masuk</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
