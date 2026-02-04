'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/router';

export interface UserGroupInfo {
  id: string;
  name: string;
  clientName: string;
  galleryFolder: string;
}

export interface AuthStatus {
  isLoggedIn: boolean;
  email: string | null;
  isAdmin: boolean;
  group: UserGroupInfo | null;
}

interface AuthContextValue {
  authStatus: AuthStatus | null;
  authLoading: boolean;
  refetchAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/status');
      const status: AuthStatus = await response.json();
      setAuthStatus(status);
      return status;
    } catch (error) {
      console.error('Error checking auth status:', error);
      setAuthStatus({
        isLoggedIn: false,
        email: null,
        isAdmin: false,
        group: null,
      });
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const refetchAuth = useCallback(async () => {
    setAuthLoading(true);
    await fetchStatus();
  }, [fetchStatus]);

  return (
    <AuthContext.Provider value={{ authStatus, authLoading, refetchAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

/** Hook dla chronionych stron: pokazuje overlay tylko gdy auth jeszcze się ładuje (np. pierwsze wejście), przy nawigacji między stronami auth jest już w cache. */
export function useProtectedAuth() {
  const { authStatus, authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;
    if (!authStatus?.isLoggedIn) {
      router.push('/login');
    }
  }, [authLoading, authStatus?.isLoggedIn, router]);

  return { authStatus, authLoading };
}
