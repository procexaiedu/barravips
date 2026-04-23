import { proxyBackend } from "@/server/backend";

export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return proxyBackend(request, "/api/handoffs/summary");
}
