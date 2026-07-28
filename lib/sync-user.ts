import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db, users, type User } from "@/db";

/**
 * Upserts a Clerk user into the database. Avoids Clerk webhooks entirely —
 * sync happens inline from middleware (see proxy.ts), gated by a
 * short-lived cookie so it only runs when Clerk's cache is cold, not on
 * every request. Takes a `clerkId` (rather than using `currentUser()`)
 * because this runs from middleware, which only has access to `auth()`.
 */
export async function syncUser(clerkId: string): Promise<User | null> {
  const client = await clerkClient();
  const user = await client.users.getUser(clerkId).catch(() => null);
  if (!user) return null;

  const email = user.emailAddresses.find(
    (e) => e.id === user.primaryEmailAddressId
  )?.emailAddress ?? user.emailAddresses[0]?.emailAddress;

  if (!email) return null;

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
  const imageUrl = user.imageUrl ?? null;

  const existing = await getDbUserByClerkId(user.id);

  if (existing) {
    const unchanged =
      existing.email === email &&
      existing.name === name &&
      existing.imageUrl === imageUrl;

    // Data is identical to what's already stored — skip the write so we
    // don't churn `updatedAt` for no reason.
    if (unchanged) return existing;

    const [updated] = await db
      .update(users)
      .set({ email, name, imageUrl, updatedAt: new Date() })
      .where(eq(users.clerkId, user.id))
      .returning();

    return updated;
  }

  const [created] = await db
    .insert(users)
    .values({ clerkId: user.id, email, name, imageUrl })
    .onConflictDoNothing({ target: users.clerkId })
    .returning();

  // Lost a race with a concurrent first sync for the same user.
  return created ?? getDbUserByClerkId(user.id);
}

export async function getDbUserByClerkId(clerkId: string): Promise<User | null> {
  const [dbUser] = await db.select().from(users).where(eq(users.clerkId, clerkId));
  return dbUser ?? null;
}
