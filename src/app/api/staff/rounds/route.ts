import { NextResponse } from "next/server";
import { isStaff, listAllRounds } from "@/lib/db";

export async function GET(req: Request) {
  if (!isStaff(req.headers.get("x-staff-token")))
    return NextResponse.json({ error: "운영진만 볼 수 있어요." }, { status: 403 });
  return NextResponse.json(await listAllRounds());
}
