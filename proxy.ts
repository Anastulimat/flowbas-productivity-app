import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { syncUser } from "@/lib/sync-user";

// Cookie that marks "this user was already synced to the DB recently".
// Presence alone gates the call — while it's set we skip syncUser() (and
// the DB round-trip) entirely instead of doing it on every request.
const SYNC_COOKIE = "fb_synced";
const SYNC_TTL_SECONDS = 60 * 60; // re-sync at most once an hour per user

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();
  const res = NextResponse.next();

  if (userId && req.cookies.get(SYNC_COOKIE)?.value !== userId) {
    await syncUser(userId);
    res.cookies.set(SYNC_COOKIE, userId, {
      maxAge: SYNC_TTL_SECONDS,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }

  return res;
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html|css|js|gif|svg|jpg|jpeg|png|woff|woff2|ico|csv|docx|xlsx|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
