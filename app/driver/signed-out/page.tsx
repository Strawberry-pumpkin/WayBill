// Public on purpose (proxy.ts exempts it): it must render after the session has ended.
const DISPATCH_PHONE = process.env.NEXT_PUBLIC_DISPATCH_PHONE;

export default function SignedOut() {
  return (
    <div className="centered">
      <div className="card status-panel" style={{ padding: "var(--space-8)" }}>
        <div className="logo-mark">W</div>
        <h1 className="t-title">You&apos;re signed out</h1>
        <span className="t-body t-secondary">Your session has ended. Anything recorded offline is safely stored on this device.</span>
        <a className="btn btn-primary btn-block" href="/login">Log back in</a>
        {DISPATCH_PHONE && <a className="btn btn-ghost" href={`tel:${DISPATCH_PHONE}`}>Need help? Contact dispatch</a>}
      </div>
    </div>
  );
}
