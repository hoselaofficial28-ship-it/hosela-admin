"use client";

import { createContext, useContext } from "react";

interface SessionContextValue {
  userRole: string;
  userPermissions: string[];
  sessionLoaded: boolean;
}

const SessionContext = createContext<SessionContextValue>({
  userRole: "",
  userPermissions: [],
  sessionLoaded: false,
});

export const SessionProvider = SessionContext.Provider;

export function useSession() {
  return useContext(SessionContext);
}
