"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3, ClipboardEdit, History, LogOut, Menu, X,
  ListTodo, Settings, Bell, StickyNote, NotebookPen, UsersRound,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { hasPermission, type FeatureKey } from "@/lib/permissions";
import { BrandMark } from "@/components/BrandMark";

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

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => {
        if (!r.ok) {
          router.replace("/login");
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (d.user) {
          setUserName(d.user.name);
          setUserRole(d.user.role);
          setUserPermissions(d.user.permissions || []);
        }
      })
      .catch(() => router.replace("/login"))
      .finally(() => setSessionLoaded(true));
  }, [router]);

  useEffect(() => {
    if (!userRole) return;

    const warmUpRoutes = () => {
      const today = new Date();
      const end = today.toISOString().split("T")[0];
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 29);
      const start = startDate.toISOString().split("T")[0];
      const currentMonth = end.substring(0, 7);
      const routes = allNavItems
        .filter((item) => hasPermission(userRole, userPermissions, item.feature))
        .map((item) => item.href);

      for (const href of routes) {
        router.prefetch(href);
      }

      const warmUpApiUrls = [
        "/api/stores",
        `/api/shipments?start=${start}&end=${end}`,
        `/api/stats?start=${start}&end=${end}`,
        "/api/notes/summary",
        `/api/meetings?month=${currentMonth}`,
      ];

      if (hasPermission(userRole, userPermissions, "tasks")) {
        warmUpApiUrls.push("/api/tasks?status=all");
      }

      Promise.allSettled(warmUpApiUrls.map((url) => fetch(url))).catch(() => {});
    };

    const idleCallback = window.requestIdleCallback?.(warmUpRoutes) ?? window.setTimeout(warmUpRoutes, 800);
    return () => {
      if (typeof idleCallback === "number") {
        window.clearTimeout(idleCallback);
      } else {
        window.cancelIdleCallback?.(idleCallback);
      }
    };
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

  return (
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

        <div className="px-3 py-4 border-t border-gray-100">
          <div className="flex items-center gap-3 px-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
              {userName.charAt(0).toUpperCase() || "U"}
            </div>
            <span className="text-sm text-gray-700 truncate">{userName || "User"}</span>
          </div>
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
              <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 w-full">
                <LogOut className="w-5 h-5" />
                Keluar
              </button>
            </div>
          </aside>
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

        <main className="flex-1 overflow-auto">
          {children}
        </main>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden flex items-center justify-around bg-white border-t border-gray-200 py-2">
          {bottomNavItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-xs font-medium transition relative ${
                  active ? "text-blue-600" : "text-gray-400"
                }`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
                {item.href === "/tasks" && unreadCount > 0 && (
                  <span className="absolute -top-0.5 right-1 bg-red-500 text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? "+" : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
