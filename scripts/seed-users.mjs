import { createClient } from '@supabase/supabase-js';

// .env.local එකේ තියෙන variables හෝ direct values ලබා දෙන්න
const SUPABASE_URL = 'https://qxljaoymutzebiesrxrd.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'sb_publishable_rxGgG_SWVWdLEd5i6bybtw_6WO4mP2S'; // Dashboard -> Settings -> API -> service_role key

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const users = [
  { email: 'dispatcher@waypoint.lk', password: 'Pass123!', name: 'Nimal Perera', role: 'dispatcher' },
  { email: 'driver@waypoint.lk', password: 'Pass123!', name: 'Sunil Fernando', role: 'driver' },
  { email: 'outlet@waypoint.lk', password: 'Pass123!', name: 'Kamal Silva', role: 'outlet_manager' },
  { email: 'admin@waypoint.lk', password: 'Pass123!', name: 'System Admin', role: 'admin' },
];

async function seed() {
  for (const u of users) {
    // 1. Native Admin API එකෙන් GoTrue Auth user හදන්න
    const { data: userData, error: createError } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
    });

    if (createError) {
      console.error(`Error creating ${u.email}:`, createError.message);
      continue;
    }

    // 2. Profile table එකට Role එක insert කරන්න
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userData.user.id,
        email: u.email,
        name: u.name,
        role: u.role,
      });

    if (profileError) {
      console.error(`Error adding profile for ${u.email}:`, profileError.message);
    } else {
      console.log(`Successfully created user & profile for: ${u.email}`);
    }
  }
}

seed();