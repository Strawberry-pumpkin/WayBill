// app/layout.tsx
import { AuthProvider } from "@/context/AuthContext";
import React from "react";

export const metadata = {
  title: "Waypoint Dispatch",
  description: "Logistics and Fleet Management System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}