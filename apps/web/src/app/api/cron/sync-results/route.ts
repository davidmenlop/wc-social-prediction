import { NextResponse } from "next/server";
import { isInternalTokenValid } from "@/lib/auth/internal-token";
import { syncResultsForDate } from "@/lib/results/sync-results";
import { notifyWinners } from "@/lib/winners/notify-winners";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isInternalTokenValid(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const date = url.searchParams.get("date") || undefined;

    const syncResult = await syncResultsForDate({ date });
    const notifyResult = await notifyWinners();

    return NextResponse.json({ ok: true, syncResult, notifyResult });
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
