import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-w-0 flex-1 pb-24 md:pb-0">
          <div className="mx-auto max-w-[1600px] px-5 py-5 md:px-7 md:py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
