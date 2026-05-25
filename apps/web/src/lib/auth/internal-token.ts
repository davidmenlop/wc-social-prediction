import "server-only";

import { getRequiredServerEnv } from "@/lib/env.server";

export function isInternalTokenValid(request: Request): boolean {
  const token = getRequiredServerEnv("INTERNAL_API_TOKEN");
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }
  const provided = authHeader.slice("Bearer ".length).trim();
  return provided.length > 0 && provided === token;
}
