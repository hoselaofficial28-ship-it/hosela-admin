"use client";

import { createContext, useContext } from "react";

interface SessionContextValue {
  userRole: string;
  userName: string;
  userPermissions: string[];
  sessionLoaded: boolean;
}

const SessionContext = createContext<SessionContextValue>({
  userRole: "",
  userName: "",
  userPermissions: [],
  sessionLoaded: false,
});

export const SessionProvider = SessionContext.Provider;

export function useSession() {
  return useContext(SessionContext);
}
