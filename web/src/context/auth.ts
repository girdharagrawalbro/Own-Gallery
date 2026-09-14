import { createContext, useContext } from 'react';
import type { AuthTokens, User } from '../types/media';

export interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  /** Persist both tokens and mark the user as signed in. */
  login: (tokens: AuthTokens, user: User) => void;
  /** Update the cached profile (e.g. after editing it in settings). */
  updateUser: (user: User) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
