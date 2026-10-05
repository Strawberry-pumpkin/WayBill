"use client";
import { useDriver } from "@/components/driver/DriverProvider";
import { BottomNav, Gate, OfflineBanner, TopBar } from "@/components/driver/ui";
import { initials } from "@/lib/driver/format";

function Profile() {
  const { identity, run, pending, signOut } = useDriver();
  const stops = run?.stops.length ?? 0;
  return (
    <>
      <TopBar title="Profile" right={<span />} />
      <OfflineBanner />
      <div className="content">
        <div className="card" style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div className="avatar" style={{ width: 56, height: 56 }}>{initials(identity?.name ?? "")}</div>
          <div><span className="t-title">{identity?.name}</span><br /><span className="t-body t-secondary">Delivery driver{run?.vehicle.depot ? ` · ${run.vehicle.depot} depot` : ""}</span></div>
        </div>
        <div className="card">
          <div className="profile-row"><span className="t-body">Vehicle</span><span className="t-body t-secondary">{run ? `${run.vehicle.id} · ${run.vehicle.type}` : "None assigned"}</span></div>
          <div className="profile-row"><span className="t-body">Temperature capability</span><span className="t-body t-secondary">{run ? (run.vehicle.temp === "reefer" ? "Chilled + ambient" : "Ambient only") : "—"}</span></div>
          <div className="profile-row"><span className="t-body">Home depot</span><span className="t-body t-secondary">{run?.vehicle.depot ?? "—"}</span></div>
          <div className="profile-row"><span className="t-body">Stops on your run</span><span className="t-body t-secondary">{stops}</span></div>
        </div>
        {pending > 0 && <div className="card t-body">{pending} record{pending > 1 ? "s are" : " is"} still waiting to sync. They stay on this phone if you sign out, and upload when you sign in again.</div>}
        <button type="button" className="btn btn-secondary btn-block" onClick={() => void signOut()}>Log out</button>
      </div>
      <BottomNav active="/driver/profile" />
    </>
  );
}

export default function Page() {
  return <Gate needRun={false}><Profile /></Gate>;
}
