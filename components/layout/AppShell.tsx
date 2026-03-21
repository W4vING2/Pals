"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { DesktopSidebar } from "./DesktopSidebar";
import { MobileNavBar } from "./MobileNavBar";
import { useAuth } from "@/hooks/useAuth";
import { useCallStore, useCreatePostStore } from "@/lib/store";
import { IncomingCallBanner } from "@/components/calls/IncomingCallBanner";
import { CallOverlay } from "@/components/calls/CallOverlay";
import { CreatePost } from "@/components/feed/CreatePost";

const AUTH_PATHS = ["/auth"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const { activeCall } = useCallStore();
  const { open: createPostOpen, setOpen: setCreatePostOpen } = useCreatePostStore();

  const isAuthPage = AUTH_PATHS.some((p) => pathname.startsWith(p));
  const showNav = !isAuthPage && !!user && !loading;

  return (
    <>
      {showNav && (
        <>
          <DesktopSidebar />
          <MobileNavBar />
          <IncomingCallBanner />
          <CreatePost
            open={createPostOpen}
            onClose={() => setCreatePostOpen(false)}
          />
        </>
      )}
      {activeCall && <CallOverlay />}

      <main
        className={
          showNav
            ? "min-h-dvh pb-20 lg:pb-0 lg:pl-60"
            : "min-h-dvh"
        }
      >
        {children}
      </main>
    </>
  );
}
