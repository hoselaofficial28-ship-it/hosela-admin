export const DEPARTMENTS = [
  { key: "admin_marketplace", label: "Admin Marketplace" },
  { key: "admin_gudang", label: "Admin Gudang" },
  { key: "kepala_gudang", label: "Kepala Gudang" },
  { key: "host_live_streaming", label: "Host Live Streaming" },
  { key: "content_creator", label: "Content Creator" },
] as const;

export const FEATURES = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard" },
  { key: "input", label: "Input Resi", href: "/input" },
  { key: "history", label: "Riwayat", href: "/history" },
  { key: "tasks", label: "Tugas", href: "/tasks" },
  { key: "catatan", label: "Catatan Kerja", href: "/catatan" },
  { key: "rapat", label: "Rapat", href: "/rapat" },
  { key: "lab_riset", label: "Lab Riset", href: "/lab-riset" },
  { key: "waktu_saya", label: "Waktu Saya", href: "/waktu-saya" },
  { key: "delete_history", label: "Hapus Riwayat", href: "" },
  { key: "settings", label: "Pengaturan", href: "/settings" },
  { key: "users", label: "Users", href: "/users" },
] as const;

export type DepartmentKey = typeof DEPARTMENTS[number]["key"];
export type FeatureKey = typeof FEATURES[number]["key"];

export const DEFAULT_DEPARTMENT_PERMISSIONS: Record<string, FeatureKey[]> = {
  admin_marketplace: ["dashboard", "input", "history", "catatan", "rapat", "lab_riset"],
  admin_gudang: ["input", "history", "catatan", "rapat", "lab_riset"],
  kepala_gudang: ["dashboard", "history", "tasks", "catatan", "rapat", "lab_riset"],
  host_live_streaming: ["catatan", "rapat", "tasks", "lab_riset"],
  content_creator: ["catatan", "rapat", "tasks", "lab_riset"],
};

export function getDepartmentLabel(department?: string | null) {
  return DEPARTMENTS.find((item) => item.key === department)?.label || "Belum ditentukan";
}

export function getDefaultPermissions(department?: string | null) {
  return DEFAULT_DEPARTMENT_PERMISSIONS[department || ""] || ["catatan", "rapat"];
}

export function hasPermission(role: string | undefined, permissions: string[] | undefined, feature: FeatureKey) {
  if (role === "owner") return true;
  return Boolean(permissions?.includes(feature));
}
