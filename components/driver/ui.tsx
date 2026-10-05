"use client";
import type { ReactNode } from "react";
import { ArrowLeft, CloudOff, House, RefreshCw, Truck, User, WifiOff } from "lucide-react";
import { useDriver } from "./DriverProvider";
import { initials } from "@/lib/driver/format";
import type { StopStatus } from "@/lib/driver/types";
import type { StopView } from "@/lib/driver/stopState";
import { useSearchParams } from "next/navigation";

// Plain <a> on purpose: each screen is a document load so the service worker can serve it offline.

export function OfflineBanner() {
  const { online, authExpired, pending } = useDriver();
  if (authExpired)
    return (
      <div className="offline-banner chip-late" role="status" style={{ padding: "var(--space-3) var(--space-4)" }}>
        <CloudOff size={18} />
        <span>Your session ended. Your work is saved on this phone — <a href="/login">sign in</a> to sync it.</span>
      </div>
    );
  if (online) return null;
  return (
    <div className="offline-banner" role="status" style={{ background: "var(--yellow)", color: "var(--ink)", padding: "var(--space-3) var(--space-4)" }}>
      <WifiOff size={18} />
      <span>
        Offline — updates are saved on this phone{pending ? ` (${pending} waiting)` : ""}. Check <a href="/driver/sync">Sync</a>.
      </span>
    </div>
  );
}

export function TopBar({ back, title, right }: { back?: { href: string; label: string }; title?: string; right?: ReactNode }) {
  const { identity } = useDriver();
  return (
    <header className="top-bar compact">
      {back ? (
        <a className="back-row" href={back.href} style={{ minHeight: 44 }}>
          <ArrowLeft size={20} aria-hidden /> {back.label}
        </a>
      ) : (
        <div>
          <div className="logo-mark" aria-hidden>W</div>
        </div>
      )}
      {title && <span className="t-ui title">{title}</span>}
      {right ?? (
        <a href="/driver/profile" aria-label="Profile">
          <div className="avatar">{initials(identity?.name ?? "")}</div>
        </a>
      )}
    </header>
  );
}

const NAV = [
  { href: "/driver/dashboard", label: "Dashboard", Icon: House },
  { href: "/driver/route", label: "Route", Icon: Truck },
  { href: "/driver/sync", label: "Sync", Icon: RefreshCw },
  { href: "/driver/profile", label: "Profile", Icon: User },
] as const;

export function BottomNav({ active }: { active: (typeof NAV)[number]["href"] | "" }) {
  const { pending } = useDriver();
  return (
    <nav className="bottom-nav" aria-label="Driver">
      {NAV.map(({ href, label, Icon }) => (
        <a key={href} href={href} className={`nav-item${active === href ? " active" : ""}`} aria-current={active === href ? "page" : undefined}>
          <span className="iconwrap">
            <Icon size={22} aria-hidden />
            {href === "/driver/sync" && pending > 0 && <span className="badge" aria-label={`${pending} waiting to sync`}>{pending}</span>}
          </span>
          <span className="t-caption">{label}</span>
        </a>
      ))}
    </nav>
  );
}

const STATUS_LABEL: Record<StopStatus, { cls: string; text: string }> = {
  onplan: { cls: "chip-onplan", text: "On plan" },
  late: { cls: "chip-late", text: "Running late" },
  delivered: { cls: "chip-delivered", text: "Delivered" },
  exception: { cls: "chip-deferred", text: "Flagged" },
};

// Status is always a word and a colour together, never colour alone.
export function StatusChip({ status }: { status: StopStatus }) {
  const s = STATUS_LABEL[status];
  return (
    <span className={`chip ${s.cls}`} style={{ cursor: "default" }}>
      <span className="dot" />
      {s.text}
    </span>
  );
}

export function TempChip({ chilled }: { chilled: boolean }) {
  return <span className={`temp-chip${chilled ? " chilled" : ""}`}>{chilled ? "Chilled" : "Ambient"}</span>;
}

export function Loading({ text = "Loading…" }: { text?: string }) {
  return (
    <div className="centered" role="status">
      <span className="t-body t-secondary" style={{ textAlign: "center" }}>{text}</span>
    </div>
  );
}

export function Message({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <div className="centered">
      <div className="card status-panel" style={{ padding: "var(--space-8)" }}>
        <h1 className="t-title">{title}</h1>
        <span className="t-body t-secondary">{body}</span>
        {action && <a className="btn btn-primary btn-block" href={action.href}>{action.label}</a>}
      </div>
    </div>
  );
}

/** Wraps a per-stop screen: resolves ?id= to the stop view, or shows a not-found message. */
export function StopGate({ children }: { children: (v: StopView) => ReactNode }) {
  const id = useSearchParams().get("id");
  const { views } = useDriver();
  const view = views.find((v) => v.stop.stopId === id);
  return (
    <Gate>
      {view ? children(view) : (
        <>
          <TopBar back={{ href: "/driver/dashboard", label: "Dashboard" }} />
          <Message title="Stop not found" body="That stop isn't on your run any more. Go back to your dashboard." action={{ href: "/driver/dashboard", label: "Dashboard" }} />
        </>
      )}
    </Gate>
  );
}

/** Renders children only for a signed-in driver; handles the loading / forbidden / no-run states in one place. */
export function Gate({ children, needRun = true }: { children: ReactNode; needRun?: boolean }) {
  const { phase, run } = useDriver();
  if (phase === "loading" || phase === "unauth") return <Loading />;
  if (phase === "forbidden") return <Message title="No access" body="This account is not a driver account." action={{ href: "/login", label: "Switch account" }} />;
  if (needRun && !run) return (
    <>
      <TopBar />
      <OfflineBanner />
      <Message title="No vehicle assigned" body="Dispatch hasn't assigned you a vehicle yet. Check back, or contact dispatch." />
      <BottomNav active="" />
    </>
  );
  return <>{children}</>;
}
