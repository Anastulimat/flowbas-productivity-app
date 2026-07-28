import "server-only";
import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db, users, type User } from "@/db";

/**
 * Upserts the signed-in Clerk user into the database. Safe to call on
 * every request for an authenticated user (no-op write if unchanged).
 * Avoids Clerk webhooks entirely — sync happens inline on sign-in/sign-up.
 */
export async function syncUser(): Promise<User | null> {
  const user = await currentUser();
  if (!user) return null;

  const email = user.emailAddresses.find(
    (e) => e.id === user.primaryEmailAddressId
  )?.emailAddress ?? user.emailAddresses[0]?.emailAddress;

  if (!email) return null;

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || null;

  const [dbUser] = await db
    .insert(users)
    .values({
      clerkId: user.id,
      email,
      name,
      imageUrl: user.imageUrl,
    })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: {
        email,
        name,
        imageUrl: user.imageUrl,
        updatedAt: new Date(),
      },
    })
    .returning();

  return dbUser;
}

export async function getDbUserByClerkId(clerkId: string): Promise<User | null> {
  const [dbUser] = await db.select().from(users).where(eq(users.clerkId, clerkId));
  return dbUser ?? null;
}
