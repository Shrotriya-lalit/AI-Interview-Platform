// app/api/auth/signout/route.ts
import { NextResponse } from "next/server";
import { signOut as serverSignOut } from "@/lib/actions/auth.action";

export async function POST() {
  // this clears the `session` cookie on the server
  await serverSignOut();
  return NextResponse.json({ ok: true });
}
