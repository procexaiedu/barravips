import { proxyBackend } from "@/server/backend";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return proxyBackend(request, `/api/media/${encodeURIComponent(id)}`);
}
