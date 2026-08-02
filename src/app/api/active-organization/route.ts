import { NextResponse } from "next/server";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/env";
import { requireTenantContext, requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = (await request.json()) as { organizationId?: string };
    const organizationId = body.organizationId?.trim();
    if (!organizationId) {
      return NextResponse.json({ error: "organizationId required" }, { status: 400 });
    }

    const context = await requireTenantContext(organizationId);
    const response = NextResponse.json({ ok: true, organizationId: context.organizationId });
    response.cookies.set(ACTIVE_ORGANIZATION_COOKIE, context.organizationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    return response;
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    const message = error instanceof AppError ? error.message : "Unable to set organization";
    return NextResponse.json({ error: message }, { status });
  }
}
