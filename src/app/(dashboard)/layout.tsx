"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3, ClipboardEdit, History, LogOut, Menu, X,
  ListTodo, Settings, Bell, StickyNote, NotebookPen, UsersRound,
  ArrowLeftRight, ChevronDown, Shield, FlaskConical, Timer,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { hasPermission, type FeatureKey } from "@/lib/permissions";
import { BrandMark } from "@/components/BrandMark";
import { SessionProvider } from "@/lib/session-context";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  feature: FeatureKey;
}

const allNavItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3, feature: "dashboard" },
  { href: "/input", label: "Input Resi", icon: ClipboardEdit, feature: "input" },
  { href: "/history", label: "Riwayat", icon: History, feature: "history" },
  { href: "/tasks", label: "Tugas", icon: ListTodo, feature: "tasks" },
  { href: "/catatan", label: "Catatan Kerja", icon: StickyNote, feature: "catatan" },
  { href: "/rapat", label: "Rapat", icon: NotebookPen, feature: "rapat" },
  { href: "/lab-riset", label: "Lab Riset", icon: FlaskConical, feature: "lab_riset" },
  { href: "/waktu-saya", label: "Waktu Saya", icon: Timer, feature: "waktu_saya" },
  { href: "/users", label: "Users", icon: UsersRound, feature: "users" },
  { href: "/settings", label: "Pengaturan", icon: Settings, feature: "settings" },
];

const allBottomNavItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3, feature: "dashboard" },
  { href: "/input", label: "Input", icon: ClipboardEdit, feature: "input" },
  { href: "/history", label: "Riwayat", icon: History, feature: "history" },
  { href: "/tasks", label: "Tugas", icon: ListTodo, feature: "tasks" },
  { href: "/catatan", label: "Catatan", icon: StickyNote, feature: "catatan" },
  { href: "/rapat", label: "Rapat", icon: NotebookPen, feature: "rapat" },
  { href: "/lab-riset", label: "Lab", icon: FlaskConical, feature: "lab_riset" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState<string>("");
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotif, setShowNotif] = useState(false);
  const [notifications, setNotifications] = useState<{ id: number; title: string; message: string; read: number; created_at: string }[]>([]);
  const [switchedFrom, setSwitchedFrom] = useState<{ name: string; id: number } | null>(null);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [switchUsers, setSwitchUsers] = useState<{ id: number; name: string; role: string; username: string }[]>([]);
  const [userId, setUserId] = useState(0);
  const [switching, setSwitching] = useState(false);

  const loadSession = useCallback(() => {
    fetch("/api/auth/me")
      .then((r) => {
        if (!r.ok) {
          router.replace("/login");
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (d?.user) {
          setUserName(d.user.name);
          setUserRole(d.user.role);
          setUserId(d.user.id);
          setUserPermissions(d.user.permissions || []);
          setSwitchedFrom(d.switchedFrom || null);
        }
      })
      .catch(() => router.replace("/login"))
      .finally(() => setSessionLoaded(true));
  }, [router]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    const today = new Date();
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const end = fmt(today);
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 29);
    const start = fmt(startDate);

    Promise.allSettled([
      fetch("/api/stores"),
      fetch(`/api/shipments?start=${start}&end=${end}`),
      fetch(`/api/stats?start=${start}&end=${end}`),
    ]).catch(() => {});
  }, []);

  useEffect(() => {
    if (!userRole) return;

    const routes = allNavItems
      .filter((item) => hasPermission(userRole, userPermissions, item.feature))
      .map((item) => item.href);

    for (const href of routes) {
      router.prefetch(href);
    }
  }, [router, userPermissions, userRole]);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch {}
  }, []);

  useEffect(() => {
    Promise.resolve().then(loadNotifications);
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  async function markAllRead() {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "all" }),
    });
    loadNotifications();
  }

  const navItems = allNavItems.filter((item) => hasPermission(userRole, userPermissions, item.feature));
  const bottomNavItems = allBottomNavItems.filter((item) => hasPermission(userRole, userPermissions, item.feature));

  useEffect(() => {
    if (!sessionLoaded || !userRole) return;

    const currentItem = allNavItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
    if (!currentItem || hasPermission(userRole, userPermissions, currentItem.feature)) return;

    router.replace(navItems[0]?.href || "/login");
  }, [navItems, pathname, router, sessionLoaded, userPermissions, userRole]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function openSwitcher() {
    if (switchUsers.length === 0) {
      fetch("/api/auth/switch").then((r) => r.ok ? r.json() : []).then((data) => {
        setSwitchUsers(Array.isArray(data) ? data : []);
        setShowSwitcher(true);
      });
    } else {
      setShowSwitcher(!showSwitcher);
    }
  }

  async function switchToUser(targetId: number) {
    if (targetId === userId || switching) return;
    setSwitching(true);
    setShowSwitcher(false);
    await fetch("/api/auth/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: targetId }),
    });
    window.location.reload();
  }

  const sessionValue = { userRole, userName, userPermissions, sessionLoaded };

  return (
    <SessionProvider value={sessionValue}>
      <div className="h-full flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col bg-white border-r border-gray-200">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
          <BrandMark />
          <div>
            <h1 className="font-bold text-gray-900 text-sm">Hosela Notion</h1>
            <p className="text-xs text-gray-400">Workspace</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
                {item.href === "/tasks" && unreadCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-gray-100 relative">
          <button onClick={(userRole === "owner" || switchedFrom) ? openSwitcher : undefined}
            className="flex items-center gap-3 px-3 mb-3 w-full text-left hover:bg-gray-50 rounded-lg py-1.5 transition"
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${switchedFrom ? "bg-amber-100 text-amber-700" : "bg-gray-200 text-gray-600"}`}>
              {userName.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm text-gray-700 truncate block">{userName || "User"}</span>
              {switchedFrom && <span className="text-[10px] text-amber-600">via {switchedFrom.name}</span>}
            </div>
            {(userRole === "owner" || switchedFrom) && <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
          </button>

          {showSwitcher && (
            <div className="absolute bottom-full left-3 right-3 mb-1 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50 animate-fade-in">
              <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
                <ArrowLeftRight className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500">Pindah Akun</span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {switchUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => switchToUser(u.id)}
                    disabled={switching}
                    className={`flex items-center gap-3 px-3 py-2.5 w-full text-left hover:bg-gray-50 transition ${u.id === userId ? "bg-blue-50" : ""}`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${u.id === userId ? "bg-blue-200 text-blue-700" : "bg-gray-200 text-gray-600"}`}>
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-900 truncate">{u.name}</div>
                      <div className="text-[10px] text-gray-400">{u.role === "owner" ? "Owner" : u.username}</div>
                    </div>
                    {u.id === userId && <span className="text-[10px] font-medium text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">Aktif</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 w-full transition"
          >
            <LogOut className="w-5 h-5" />
            Keluar
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="fixed inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white shadow-xl animate-fade-in z-50">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <BrandMark />
                <h1 className="font-bold text-gray-900 text-sm">Hosela Notion</h1>
              </div>
              <button onClick={() => setSidebarOpen(false)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <nav className="px-3 py-4 space-y-1">
              {navItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                      active ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="absolute bottom-0 left-0 right-0 px-3 py-4 border-t border-gray-100">
              {(userRole === "owner" || switchedFrom) && (
                <button
                  onClick={openSwitcher}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 w-full mb-1 transition"
                >
                  <ArrowLeftRight className="w-5 h-5" />
                  Pindah Akun
                </button>
              )}
              <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 w-full">
                <LogOut className="w-5 h-5" />
                Keluar
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Account Switcher Overlay (click outside to close) */}
      {showSwitcher && <div className="fixed inset-0 z-40" onClick={() => setShowSwitcher(false)} />}

      {/* Switching Account Overlay */}
      {switching && (
        <div className="fixed inset-0 z-[60] bg-white/80 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-sm font-medium text-gray-600">Memindahkan akun...</p>
          </div>
        </div>
      )}

      {/* Notification Panel */}
      {showNotif && (
        <div className="fixed inset-0 z-50" onClick={() => setShowNotif(false)}>
          <div className="fixed right-4 top-14 md:right-auto md:left-64 md:top-4 w-80 bg-white rounded-2xl shadow-xl border border-gray-200 animate-fade-in z-50" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 text-sm">Notifikasi</h3>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Tandai dibaca</button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">Belum ada notifikasi</div>
              ) : (
                notifications.slice(0, 20).map((n) => (
                  <div key={n.id} className={`px-4 py-3 border-b border-gray-50 ${!n.read ? "bg-blue-50/50" : ""}`}>
                    <div className="text-sm font-medium text-gray-900">{n.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{n.message}</div>
                    <div className="text-[10px] text-gray-300 mt-1">{n.created_at}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
          <button onClick={() => setSidebarOpen(true)}>
            <Menu className="w-6 h-6 text-gray-700" />
          </button>
          <h1 className="font-bold text-gray-900">Hosela Notion</h1>
          <button onClick={() => setShowNotif(!showNotif)} className="relative">
            <Bell className="w-5 h-5 text-gray-600" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        </header>

        {switchedFrom && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-amber-800">
              <Shield className="w-3.5 h-3.5" />
              <span>Melihat sebagai <strong>{userName}</strong></span>
            </div>
            <button
              onClick={() => switchToUser(switchedFrom.id)}
              disabled={switching}
              className="text-xs font-medium text-amber-700 hover:text-amber-900 bg-amber-200/60 px-2 py-1 rounded-md transition disabled:opacity-60 flex items-center gap-1.5"
            >
              {switching && <span className="w-3 h-3 border-2 border-amber-400 border-t-amber-700 rounded-full animate-spin" />}
              {switching ? "Memindahkan..." : `Kembali ke ${switchedFrom.name}`}
            </button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden flex items-center justify-around bg-white border-t border-gray-200 py-1.5 px-1">
          {bottomNavItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0 px-1.5 py-1 rounded-lg text-[10px] font-medium transition relative min-w-0 ${
                  active ? "text-blue-600" : "text-gray-400"
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="truncate max-w-full">{item.label}</span>
                {item.href === "/tasks" && unreadCount > 0 && (
                  <span className="absolute -top-0.5 right-0 bg-red-500 text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? "+" : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        </div>
      </div>
    </SessionProvider>
  );
}
