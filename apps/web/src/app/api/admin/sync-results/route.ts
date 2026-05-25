import { NextResponse } from "next/server";
import { isInternalTokenValid } from "@/lib/auth/internal-token";
import { syncResultsForDate } from "@/lib/results/sync-results";
import { notifyWinners } from "@/lib/winners/notify-winners";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isInternalTokenValid(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let date: string | undefined;

    try {
      const body = (await request.json()) as { date?: string };
      date = body?.date;
    } catch {
      date = undefined;
    }

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
