import { NextResponse } from "next/server";
import { isInternalTokenValid } from "@/lib/auth/internal-token";
import { sendPredictionReminders } from "@/lib/notifications/events";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isInternalTokenValid(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const minutesParam = url.searchParams.get("minutes");
    const minutes = minutesParam ? Number.parseInt(minutesParam, 10) : 120;

    const result = await sendPredictionReminders(
      Number.isNaN(minutes) ? 120 : minutes
    );
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
