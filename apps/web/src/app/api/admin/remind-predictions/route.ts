import { NextResponse } from "next/server";
import { isInternalTokenValid } from "@/lib/auth/internal-token";
import { sendPredictionReminders } from "@/lib/notifications/events";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isInternalTokenValid(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let minutes = 120;
    try {
      const body = (await request.json()) as { minutes?: number };
      if (typeof body.minutes === "number") {
        minutes = body.minutes;
      }
    } catch {
      minutes = 120;
    }

    const result = await sendPredictionReminders(minutes);
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
