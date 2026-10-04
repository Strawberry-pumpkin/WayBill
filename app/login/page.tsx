// app/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Authenticate with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        throw new Error(authError.message);
      }

      if (!authData.user) {
        throw new Error("No user session found.");
      }

      // 2. Fetch User Profile & Role from 'profiles' table
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .maybeSingle();

      if (profileError || !profile) {
        throw new Error("Failed to retrieve user profile or role assignment.");
      }

      const role = profile.role;

      // 3. Set cookies for Middleware Edge Protection
      document.cookie = `auth_token=${authData.session.access_token}; path=/; max-age=86400; SameSite=Lax`;
      document.cookie = `user_role=${role}; path=/; max-age=86400; SameSite=Lax`;

      // 4. Redirect based on assigned role
      switch (role) {
        case "dispatcher":
          router.replace("/dispatcher/dashboard");
          break;
        case "driver":
          router.replace("/driver/dashboard");
          break;
        case "outlet_manager":
          router.replace("/outlet/dashboard");
          break;
        case "admin":
          router.replace("/admin/dashboard");
          break;
        default:
          router.replace("/unauthorized");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during login.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--paper, #f9fafb)",
        fontFamily: "var(--font-sans, sans-serif)",
        padding: "16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "var(--white, #ffffff)",
          border: "1px solid var(--g300, #e5e7eb)",
          borderRadius: 16,
          padding: 32,
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div
            style={{
              width: 48,
              height: 48,
              background: "var(--yellow, #facc15)",
              border: "2px solid var(--on-yellow, #000000)",
              color: "var(--on-yellow, #000000)",
              borderRadius: 12,
              display: "grid",
              placeItems: "center",
              fontWeight: 900,
              fontSize: 24,
              margin: "0 auto 12px",
            }}
          >
            W
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 800,
              color: "var(--ink, #111827)",
              letterSpacing: "-0.02em",
            }}
          >
            Waypoint Dispatch
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--g600, #4b5563)" }}>
            Fleet & Dispatch Management System
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            style={{
              padding: "10px 14px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 20,
            }}
          >
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label
              htmlFor="email"
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--ink, #111827)",
                marginBottom: 6,
              }}
            >
              Email Address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="dispatcher@waypoint.lk"
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid var(--g300, #d1d5db)",
                fontSize: 14,
                boxSizing: "border-box",
                outline: "none",
              }}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--ink, #111827)",
                marginBottom: 6,
              }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid var(--g300, #d1d5db)",
                fontSize: 14,
                boxSizing: "border-box",
                outline: "none",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              background: "var(--ink, #111827)",
              color: "var(--paper, #ffffff)",
              border: "none",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 14,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              marginTop: 8,
            }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}