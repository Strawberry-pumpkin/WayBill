// app/dispatcher/layout.tsx
"use client";

import "./tokens.css";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import ThemeToggle from "@/components/ThemeToggle";
import {
  LayoutDashboard,
  ClipboardList,
  Shuffle,
  History as HistoryIcon,
  Gauge,
  Users,
  CircleUserRound,
  type LucideIcon,
} from "lucide-react";

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dispatcher/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dispatcher/orders", label: "Orders", icon: ClipboardList },
  { href: "/dispatcher/plan", label: "Allocate", icon: Shuffle },
  { href: "/dispatcher/history", label: "History", icon: HistoryIcon },
  { href: "/dispatcher/capacity", label: "Capacity", icon: Gauge },
  { href: "/dispatcher/drivers", label: "Drivers", icon: Users },
  { href: "/dispatcher/profile", label: "Profile", icon: CircleUserRound },
];

export default function DispatcherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();

  // Authentication Guard Logic
  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace("/login");
      } else if (user.role !== "dispatcher" && user.role !== "admin") {
        router.replace("/unauthorized");
      }
    }
  }, [user, loading, router]);

  const currentNavItem = NAV.find((item) => pathname?.startsWith(item.href));
  const pageTitle = currentNavItem ? currentNavItem.label : "";

  // Session check වන තුරු UI එක load වීම වළක්වයි
  if (loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", background: "var(--paper)" }}>
        <p style={{ fontWeight: 600, color: "var(--g600)" }}>Checking authentication...</p>
      </div>
    );
  }

  // User verified නැත්නම් UI එක පෙන්වන්නේ නැත
  if (!user || (user.role !== "dispatcher" && user.role !== "admin")) {
    return null;
  }

  return (
    <div
      style={{
        fontFamily: "var(--font-sans)",
        color: "var(--ink)",
        background: "var(--paper)",
        minHeight: "100vh",
        display: "flex",
        width: "100%",
      }}
    >
      <nav
        style={{
          width: 100,
          flex: "none",
          background: "var(--white)",
          borderRight: "1px solid var(--g300)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          padding: "14px 6px",
          position: "sticky",
          top: 0,
          height: "100vh",
          boxSizing: "border-box",
        }}
        className="dispatcher-side-nav"
      >
        <div
          style={{
            width: 40,
            height: 40,
            background: "var(--yellow)",
            border: "2px solid var(--on-yellow)",
            color: "var(--on-yellow)",
            borderRadius: 8,
            display: "grid",
            placeItems: "center",
            fontWeight: 900,
            marginBottom: 10,
          }}
        >
          W
        </div>
        {NAV.map((item) => {
          const active = pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                width: "100%",
                padding: "8px 2px",
                borderRadius: 8,
                fontSize: 12,
                color: active ? "var(--paper)" : "var(--g600)",
                background: active ? "var(--ink)" : "transparent",
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              <Icon size={18} strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", width: "100%" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 24px",
            background: "var(--white)",
            borderBottom: "1px solid var(--g300)",
            position: "sticky",
            top: 0,
            zIndex: 4,
          }}
        >
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>Waypoint Dispatch</span>
            {pageTitle && (
              <>
                <span style={{ color: "var(--g400)", fontWeight: 400 }}>/</span>
                <span style={{ fontWeight: 600, fontSize: 15, color: "var(--g600)" }}>
                  {pageTitle}
                </span>
              </>
            )}
          </div>

          <ThemeToggle />

          <Link
            href="/dispatcher/profile"
            aria-label="Profile"
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "var(--yellow)",
              color: "var(--on-yellow)",
              display: "grid",
              placeItems: "center",
              textDecoration: "none",
            }}
          >
            <CircleUserRound size={20} strokeWidth={2} />
          </Link>
        </header>

        <main style={{ padding: 24, width: "100%", boxSizing: "border-box" }}>
          {children}
        </main>
      </div>

      <style>{`
        @media (max-width: 820px) {
          .dispatcher-side-nav {
            position: fixed; bottom: 0; left: 0; right: 0; top: auto;
            width: 100%; height: auto; flex-direction: row; justify-content: space-around;
            padding: 6px 4px calc(6px + env(safe-area-inset-bottom)); z-index: 6;
            border-right: 0; border-top: 1px solid var(--g300);
          }
          .dispatcher-side-nav > div:first-child { display: none; }
        }
      `}</style>
    </div>
  );
}