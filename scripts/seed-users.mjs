// Creates the four demo accounts (Auth user + profiles row). Run once per project:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-users.mjs
// The service-role key bypasses RLS and must never be committed or used by app code: this script only.
// To make a driver usable you also need a `drivers` row (id = that user's auth id, vehicle_id = 'VEHxxx').
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY. See .env.example.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const users = [
  { email: "dispatcher@waypoint.lk", name: "Nimal Perera", role: "dispatcher" },
  { email: "driver@waypoint.lk", name: "Sunil Fernando", role: "driver" },
  { email: "outlet@waypoint.lk", name: "Kamal Silva", role: "outlet_manager" },
  { email: "admin@waypoint.lk", name: "System Admin", role: "admin" },
];

const password = process.env.SEED_PASSWORD;
if (!password || password.length < 12) {
  console.error("Set SEED_PASSWORD (12+ characters). It is not stored anywhere.");
  process.exit(1);
}

async function findUserId(email) {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
}

for (const u of users) {
  let id;
  const { data, error } = await supabase.auth.admin.createUser({ email: u.email, password, email_confirm: true });
  if (error) {
    id = await findUserId(u.email);
    if (!id) {
      console.error(`Error creating ${u.email}: ${error.message}`);
      continue;
    }
  } else {
    id = data.user.id;
  }
  const { error: profileError } = await supabase.from("profiles").upsert({ id, email: u.email, name: u.name, role: u.role });
  console.log(profileError ? `Profile error for ${u.email}: ${profileError.message}` : `OK ${u.email} (${u.role})`);
}
