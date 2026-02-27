import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User {
  id: string;
  email: string;
  name?: string;
  verified: boolean;
}

interface ImpersonationInfo {
  originalAdminId: string;
  originalAdminEmail: string;
  originalAdminName?: string;
  impersonationLogId: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  impersonation: ImpersonationInfo | null;
  setAuth: (user: User, token: string, impersonation?: ImpersonationInfo) => void;
  updateUser: (updates: Partial<User>) => void;
  logout: () => void;
  isImpersonating: () => boolean;
  clearImpersonation: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      impersonation: null,
      setAuth: (user, token, impersonation) =>
        set({
          user,
          token,
          isAuthenticated: true,
          impersonation: impersonation || null,
        }),
      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),
      logout: () =>
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          impersonation: null,
        }),
      isImpersonating: () => get().impersonation !== null,
      clearImpersonation: () => set({ impersonation: null }),
    }),
    {
      name: "eutlas-auth",
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        impersonation: state.impersonation,
      }),
    }
  )
);





