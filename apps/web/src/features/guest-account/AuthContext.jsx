/** Guest auth context - hydrates from /auth/me on load; real server sessions. */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import * as auth from "@/services/authService.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    auth.bootstrap().then((a) => {
      if (on) {
        setAccount(a);
        setLoading(false);
      }
    });
    return () => { on = false; };
  }, []);

  const value = useMemo(
    () => ({
      account,
      loading,
      signIn: async (creds) => {
        const result = await auth.signIn(creds);
        if (result.ok) setAccount(result.account);
        return result;
      },
      signOut: async () => {
        await auth.signOut();
        setAccount(null);
      },
      updateProfile: async (profile) => {
        const accountNow = await auth.saveProfile(profile);
        setAccount(accountNow);
        return accountNow;
      },
    }),
    [account, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
};
