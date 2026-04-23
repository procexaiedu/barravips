import { proxyBackend } from "@/server/backend";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return proxyBackend(request, "/api/schedule/slots/block");
}
