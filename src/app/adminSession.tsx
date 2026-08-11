import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

type AdminSessionContextValue = {
  error: string | null;
  isAdmin: boolean;
  isEditMode: boolean;
  isLoginOpen: boolean;
  isSupabaseReady: boolean;
  session: Session | null;
  closeLogin: () => void;
  openLogin: () => void;
  requestEditing: () => void;
  setEditMode: (enabled: boolean) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AdminSessionContext = createContext<AdminSessionContextValue | null>(null);

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setIsAdmin(false);
        setIsEditMode(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function checkAdminAccess() {
      if (!supabase || !session) {
        setIsAdmin(false);
        setIsEditMode(false);
        return;
      }

      const allowed = await hasAdminAccess();
      if (isCancelled) return;

      setIsAdmin(allowed);
      if (!allowed) {
        setIsEditMode(false);
      }
    }

    void checkAdminAccess();

    return () => {
      isCancelled = true;
    };
  }, [session]);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);

    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase no está configurado. Añade VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.");
      return;
    }

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(signInError.message);
      return;
    }

    const allowed = await hasAdminAccess();
    if (!allowed) {
      await supabase.auth.signOut();
      setSession(null);
      setIsAdmin(false);
      setIsEditMode(false);
      setError("Este usuario no tiene permisos de administración.");
      return;
    }

    setSession(data.session);
    setIsAdmin(true);
    setIsLoginOpen(false);
    setIsEditMode(true);
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    await supabase?.auth.signOut();
    setSession(null);
    setIsEditMode(false);
  }, []);

  const requestEditing = useCallback(() => {
    setError(null);

    if (!isAdmin) {
      setIsLoginOpen(true);
      return;
    }

    setIsEditMode(true);
  }, [isAdmin]);

  const value = useMemo(
    () => ({
      error,
      isAdmin,
      isEditMode,
      isLoginOpen,
      isSupabaseReady: isSupabaseConfigured,
      session,
      closeLogin: () => setIsLoginOpen(false),
      openLogin: () => setIsLoginOpen(true),
      requestEditing,
      setEditMode: setIsEditMode,
      signIn,
      signOut,
    }),
    [error, isAdmin, isEditMode, isLoginOpen, requestEditing, session, signIn, signOut],
  );

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}

async function hasAdminAccess() {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("is_admin");
  return !error && data === true;
}

export function useAdminSession() {
  const context = useContext(AdminSessionContext);

  if (!context) {
    throw new Error("useAdminSession must be used within AdminSessionProvider");
  }

  return context;
}
