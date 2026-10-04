const TZ = "Asia/Colombo";

export const hhmm = (iso: string | Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(typeof iso === "string" ? new Date(iso) : iso);

export const nowHHMM = () => hhmm(new Date());

export const dockLabel = (dock: string, window: string) =>
  ({ rear_dock: "Rear dock", street: "Street", mall_bay: `Mall bay · ${window}`, side_bay: "Side bay" } as Record<string, string>)[dock] ?? dock;

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

export const stopLoad = (orders: { kg: number; units: number | null }[]) => {
  const kg = Math.round(orders.reduce((a, o) => a + o.kg, 0));
  const units = orders.every((o) => o.units != null) ? orders.reduce((a, o) => a + (o.units ?? 0), 0) : null;
  return units != null ? `${units} cases · ${kg} kg` : `${kg} kg`;
};
