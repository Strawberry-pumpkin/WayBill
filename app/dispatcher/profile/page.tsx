// app/dispatcher/profile/page.tsx
"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  // Avatar එක සඳහා Name Initials සදාගැනීම
  const getInitials = (name: string) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  };

  // Sign out handler
  const handleSignOut = async () => {
    try {
      await logout();
      router.push("/login");
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  };

  if (loading) {
    return <div style={{ color: "var(--g600)", padding: "20px 0" }}>Loading profile...</div>;
  }

  if (!user) {
    return <div style={{ color: "var(--red-text)", padding: "20px 0" }}>User session not found.</div>;
  }

  // Auth Context එකෙන් dynamic data ගැනීම (නැතහොත් fallback values පාවිච්චි කිරීම)
  const profileData = {
    name: user.name || "Dispatcher User",
    role: user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : "Dispatcher",
    depot: "Peliyagoda depot",
    details: [
      { label: "Email", value: user.email },
      { label: "Depot", value: "Peliyagoda" },
      { label: "Brand", value: "Waypoint Fresh" },
      { label: "District", value: "Colombo" },
      { label: "Shift", value: "Mon–Sat · orders close before cutoff" },
    ],
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "12px 0" }}>
      {/* Title */}
      <h1
        style={{
          fontSize: 32,
          fontWeight: 900,
          letterSpacing: "-0.03em",
          margin: "0 0 24px",
          color: "var(--ink, #111827)",
        }}
      >
        Profile
      </h1>

      {/* User Header Card */}
      <div
        style={{
          background: "var(--white, #ffffff)",
          border: "1px solid var(--g300, #e5e7eb)",
          borderRadius: 16,
          padding: 24,
          display: "flex",
          alignItems: "center",
          gap: 20,
          marginBottom: 20,
        }}
      >
        {/* Avatar Circle */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "var(--yellow, #facc15)",
            color: "var(--on-yellow, #000000)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: 22,
            flexShrink: 0,
          }}
        >
          {getInitials(profileData.name)}
        </div>

        {/* User Info */}
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 800,
              color: "var(--ink, #111827)",
              lineHeight: 1.2,
            }}
          >
            {profileData.name}
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 14,
              color: "var(--g600, #4b5563)",
            }}
          >
            {profileData.role} · {profileData.depot}
          </p>
        </div>
      </div>

      {/* Detailed Info List Card */}
      <div
        style={{
          background: "var(--white, #ffffff)",
          border: "1px solid var(--g300, #e5e7eb)",
          borderRadius: 16,
          padding: "8px 24px",
          marginBottom: 24,
        }}
      >
        {profileData.details.map((item, index) => (
          <div
            key={item.label}
            style={{
              padding: "16px 0",
              borderBottom:
                index < profileData.details.length - 1
                  ? "1px solid var(--g200, #f3f4f6)"
                  : "none",
              fontSize: 14,
              color: "var(--ink, #111827)",
            }}
          >
            <strong style={{ fontWeight: 700, marginRight: 6 }}>
              {item.label}
            </strong>{" "}
            <span style={{ color: "var(--g700, #374151)" }}>{item.value}</span>
          </div>
        ))}
      </div>

      {/* Sign Out Button */}
      <div>
        <button
          type="button"
          onClick={handleSignOut}
          style={{
            background: "var(--ink, #111827)",
            color: "var(--paper, #ffffff)",
            border: "none",
            borderRadius: 8,
            padding: "10px 20px",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}