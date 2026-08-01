"use client";

import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, X, Check, Store } from "lucide-react";
import Toast from "@/components/Toast";

interface StoreItem {
  id: number;
  name: string;
  short_name: string;
  color: string;
  sort_order: number;
}

export default function SettingsPage() {
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", short_name: "", color: "#4285f4" });
  const [deleting, setDeleting] = useState<number | null>(null);

  async function loadStores() {
    const res = await fetch("/api/stores");
    const data = res.ok ? await res.json() : [];
    setStores(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    fetch("/api/stores").then((r) => r.ok ? r.json() : []).then((d) => setStores(Array.isArray(d) ? d : [])).catch(() => setStores([]));
  }, []);

  function resetForm() {
    setForm({ name: "", short_name: "", color: "#4285f4" });
    setShowAdd(false);
    setEditId(null);
  }

  function startEdit(store: StoreItem) {
    setEditId(store.id);
    setForm({ name: store.name, short_name: store.short_name, color: store.color });
    setShowAdd(false);
  }

  async function handleSave() {
    if (!form.name || !form.short_name) {
      setToast({ message: "Nama dan singkatan wajib diisi", type: "error" });
      return;
    }

    if (editId) {
      const res = await fetch(`/api/stores/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setToast({ message: "Toko berhasil diperbarui", type: "success" });
        resetForm();
        loadStores();
      } else {
        const data = await res.json();
        setToast({ message: data.error, type: "error" });
      }
    } else {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setToast({ message: "Toko berhasil ditambahkan", type: "success" });
        resetForm();
        loadStores();
      } else {
        const data = await res.json();
        setToast({ message: data.error, type: "error" });
      }
    }
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/stores/${id}`, { method: "DELETE" });
    if (res.ok) {
      setToast({ message: "Toko berhasil dihapus", type: "success" });
      setDeleting(null);
      loadStores();
    } else {
      const data = await res.json();
      setToast({ message: data.error, type: "error" });
      setDeleting(null);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Pengaturan</h2>
          <p className="text-sm text-gray-500">Kelola toko dan konfigurasi</p>
        </div>
      </div>

      {/* Store Management */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Store className="w-5 h-5 text-blue-600" />
            Daftar Toko
          </h3>
          <button
            onClick={() => { setShowAdd(true); setEditId(null); setForm({ name: "", short_name: "", color: "#4285f4" }); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
          >
            <Plus className="w-4 h-4" />
            Tambah Toko
          </button>
        </div>

        {/* Add/Edit Form */}
        {(showAdd || editId) && (
          <div className="bg-blue-50 rounded-xl p-4 mb-4 animate-fade-in">
            <h4 className="text-sm font-medium text-blue-800 mb-3">
              {editId ? "Edit Toko" : "Tambah Toko Baru"}
            </h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="contoh: Hosela Official Store"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nama Singkat</label>
                  <input
                    type="text"
                    value={form.short_name}
                    onChange={(e) => setForm({ ...form, short_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="contoh: Hosela"
                  />
                </div>
                <div className="w-24">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Warna</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.color}
                      onChange={(e) => setForm({ ...form, color: e.target.value })}
                      className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer p-0.5"
                    />
                    <span className="text-xs text-gray-400">{form.color}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition">
                  <Check className="w-4 h-4" />
                  {editId ? "Simpan Perubahan" : "Tambah"}
                </button>
                <button onClick={resetForm} className="flex items-center gap-1.5 px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 transition">
                  <X className="w-4 h-4" />
                  Batal
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Store List */}
        <div className="space-y-2">
          {stores.map((store) => (
            <div key={store.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: store.color }} />
                <div>
                  <div className="text-sm font-medium text-gray-900">{store.name}</div>
                  <div className="text-xs text-gray-400">{store.short_name}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => startEdit(store)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                  <Pencil className="w-4 h-4" />
                </button>
                {deleting === store.id ? (
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleDelete(store.id)} className="px-2 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700">Hapus</button>
                    <button onClick={() => setDeleting(null)} className="px-2 py-1 text-xs bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300">Batal</button>
                  </div>
                ) : (
                  <button onClick={() => setDeleting(store.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Email Config Info */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <h3 className="font-semibold text-gray-900 mb-2">Konfigurasi Email</h3>
        <p className="text-sm text-gray-500 mb-3">Untuk mengaktifkan pengingat email, tambahkan variabel berikut di file <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">.env.local</code>:</p>
        <div className="bg-gray-900 rounded-xl p-4 text-sm font-mono text-green-400 space-y-1">
          <div>SMTP_HOST=smtp.gmail.com</div>
          <div>SMTP_PORT=587</div>
          <div>SMTP_USER=email@gmail.com</div>
          <div>SMTP_PASS=app-password</div>
        </div>
        <p className="text-xs text-gray-400 mt-2">Gunakan App Password dari Google, bukan password biasa.</p>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
