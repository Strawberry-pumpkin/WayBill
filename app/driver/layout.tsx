import "./driver.css";
import { Schibsted_Grotesk } from "next/font/google";

const font = Schibsted_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700", "900"], variable: "--font-drv", display: "swap" });

export const metadata = { title: "Waybill · Driver", robots: { index: false, follow: false } };
export const viewport = { width: "device-width", initialScale: 1, themeColor: "#FFDD00" };

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`drv-app ${font.variable}`}>
      <div className="shell">{children}</div>
    </div>
  );
}
