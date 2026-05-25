import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getRequiredServerEnv } from "@/lib/env.server";

const supabaseUrl = getRequiredServerEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = getRequiredServerEnv("SUPABASE_SERVICE_ROLE_KEY");

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
