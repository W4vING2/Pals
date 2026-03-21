"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { BottomNav } from "./BottomNav";
import { SideNav } from "./SideNav";
import { useAuth } from "@/hooks/useAuth";
import { IncomingCallBanner } from "@/components/calls/IncomingCallBanner";
import { CallOverlay } from "@/components/calls/CallOverlay";
import { useCallStore } from "@/lib/store";

const AUTH_PATHS = ["/auth"];

export function NavWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const { activeCall } = useCallStore();

  const isAuthPage = AUTH_PATHS.some((p) => pathname.startsWith(p));
  const showNav = !isAuthPage && !!user && !loading;

  return (
    <>
      {showNav && (
        <>
          <SideNav />
          <BottomNav />
          <IncomingCallBanner />
        </>
      )}
      {activeCall && <CallOverlay />}

      <main
        className={[
          "min-h-dvh",
          showNav ? "lg:pl-64 xl:pl-72 pb-20 lg:pb-0" : "",
        ].join(" ")}
      >
        {children}
      </main>
    </>
  );
}
