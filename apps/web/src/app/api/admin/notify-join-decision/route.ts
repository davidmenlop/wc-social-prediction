import { NextResponse } from "next/server";
import { isInternalTokenValid } from "@/lib/auth/internal-token";
import { notifyJoinDecisionUser } from "@/lib/notifications/events";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isInternalTokenValid(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { requestId?: string };
    if (!body.requestId) {
      return NextResponse.json({ error: "requestId is required" }, { status: 400 });
    }

    const result = await notifyJoinDecisionUser(body.requestId);
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
