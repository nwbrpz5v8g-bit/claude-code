import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { currentActor } from "@/server/auth/session";
import { SignOutButton } from "./_components/SignOutButton";
import "./globals.css";

export const metadata: Metadata = { title: "Car Wash", description: "Book a car wash in minutes" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const actor = await currentActor();
  return (
    <html lang="en">
      <body>
        <header className="site">
          <Link href="/"><strong>Car Wash</strong></Link>
          <nav>
            {actor.kind === "user" ? (
              <>
                <Link href="/bookings">My bookings</Link>
                <span className="muted">{actor.email}</span>
                <SignOutButton />
              </>
            ) : (
              <Link href="/login">Sign in</Link>
            )}
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
