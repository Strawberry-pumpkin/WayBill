import { Suspense } from "react";
import DriverProvider from "@/components/driver/DriverProvider";

// Everything signed-in lives here; signed-out is deliberately outside so it never triggers the auth redirect.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="centered"><span className="t-body t-secondary">Loading…</span></div>}>
      <DriverProvider>{children}</DriverProvider>
    </Suspense>
  );
}
