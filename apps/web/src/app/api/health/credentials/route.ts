import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "INTERNAL_API_TOKEN",
  ];

  const optional = [
    "WHATSAPP_PROVIDER",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_WHATSAPP_FROM",
    "FOOTBALL_API_BASE_URL",
    "FOOTBALL_API_KEY",
    "FOOTBALL_DEFAULT_LEAGUE_ID",
    "FOOTBALL_DEFAULT_SEASON",
    "FOOTBALL_DEFAULT_TIMEZONE",
  ];

  const requiredMissing = required.filter((name) => !process.env[name]);
  const optionalMissing = optional.filter((name) => !process.env[name]);

  return NextResponse.json({
    ok: requiredMissing.length === 0,
    requiredMissing,
    optionalMissing,
    whatsappProvider: process.env.WHATSAPP_PROVIDER || "none",
    footballSyncEnabled: Boolean(
      process.env.FOOTBALL_API_BASE_URL &&
        process.env.FOOTBALL_API_KEY &&
        process.env.FOOTBALL_DEFAULT_LEAGUE_ID &&
        process.env.FOOTBALL_DEFAULT_SEASON &&
        process.env.FOOTBALL_DEFAULT_TIMEZONE
    ),
  });
}
