import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

async function signOutAndRedirect(request: NextRequest): Promise<Response> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}

export function POST(request: NextRequest): Promise<Response> {
  return signOutAndRedirect(request);
}

export function GET(request: NextRequest): Promise<Response> {
  return signOutAndRedirect(request);
}
