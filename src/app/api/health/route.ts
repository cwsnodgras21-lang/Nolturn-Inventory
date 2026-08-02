import { NextResponse } from "next/server";
import { appConfig } from "@/config/app";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: appConfig.name,
    phase: appConfig.phase,
    timestamp: new Date().toISOString(),
  });
}
