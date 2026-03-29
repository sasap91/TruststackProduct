import Link from "next/link";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";

export function SiteHeader() {
  return (
    <header className="border-b border-zinc-200/80 bg-white/80 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          TrustStack
        </Link>
        <nav className="flex items-center gap-5 text-sm font-medium text-zinc-600 dark:text-zinc-400">
          <Link href="/pricing" className="transition-colors hover:text-teal-600 dark:hover:text-teal-400">
            Pricing
          </Link>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="rounded-full bg-teal-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400">
                Sign in
              </button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <Link href="/settings" className="transition-colors hover:text-teal-600 dark:hover:text-teal-400">
              Settings
            </Link>
            <Link href="/dashboard" className="rounded-full bg-teal-600 px-4 py-1.5 text-white transition-colors hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400">
              Console
            </Link>
            <UserButton />
          </Show>
        </nav>
      </div>
    </header>
  );
}
