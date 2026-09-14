import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ACCESS_TOKEN_KEY, api, setAuthFailureHandler, tokenStorage } from '../api/client';
import type { AuthTokens, User } from '../types/media';
import { AuthContext } from './auth';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  // Only "loading" when there is a stored session to verify.
  const [isLoading, setIsLoading] = useState(() => tokenStorage.getAccess() !== null || tokenStorage.getRefresh() !== null);

  const logout = useCallback(() => {
    tokenStorage.clear();
    setUser(null);
  }, []);

  // The API client calls this when a token refresh fails.
  useEffect(() => {
    setAuthFailureHandler(() => setUser(null));
    return () => setAuthFailureHandler(null);
  }, []);

  // Verify a stored session once on startup. A 401 here transparently refreshes.
  useEffect(() => {
    if (!tokenStorage.getAccess() && !tokenStorage.getRefresh()) return;
    let cancelled = false;
    api
      .me()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch((error: unknown) => {
        console.error('Auth verification failed', error);
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep tabs in sync: logging out in one tab logs out the others.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACCESS_TOKEN_KEY && e.newValue === null) setUser(null);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const login = useCallback((tokens: AuthTokens, newUser: User) => {
    tokenStorage.set(tokens);
    setUser(newUser);
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, updateUser: setUser, logout }),
    [user, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
