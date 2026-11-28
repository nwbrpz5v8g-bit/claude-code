import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { currentActor } from "@/server/auth/session";
import { Logo } from "./_components/Brand";
import { SignOutButton } from "./_components/SignOutButton";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-bricolage" });
const body = DM_Sans({ subsets: ["latin"], variable: "--font-dm" });

export const metadata: Metadata = {
  title: "SUDS: car wash, sorted",
  description: "Book a wash in under a minute. Quiet Hours save you 20%.",
};
export const viewport: Viewport = { themeColor: "#0b1430" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const actor = await currentActor();
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <header className="site">
          <Logo />
          <nav>
            {actor.kind === "user" ? (
              <>
                <Link href="/bookings" className="btn btn-sm btn-ghost">Passes</Link>
                <span className="who">{actor.email}</span>
                <SignOutButton />
              </>
            ) : (
              <Link href="/login" className="btn btn-sm">Sign in</Link>
            )}
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
