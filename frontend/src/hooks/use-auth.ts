"use client";

import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { authApi, apiClient } from "@/lib/api-client";
import { useToast } from "@/components/ui/use-toast";

/**
 * Authentication hook
 * Provides login, signup, logout functionality
 */
export function useAuth() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, isAuthenticated, setAuth, logout: clearAuth } = useAuthStore();

  const login = async (email: string, password: string) => {
    const response = await authApi.login({ email, password });

    if (response.success && response.data) {
      apiClient.setToken(response.data.accessToken);
      setAuth(response.data.user, response.data.accessToken);
      return { success: true };
    }

    return {
      success: false,
      error: response.error?.message || "Login failed",
    };
  };

  const signup = async (email: string, password: string, name?: string) => {
    const response = await authApi.signup({ email, password, name });

    if (response.success) {
      return { success: true };
    }

    return {
      success: false,
      error: response.error?.message || "Signup failed",
    };
  };

  const logout = () => {
    apiClient.setToken(null);
    clearAuth();
    router.push("/login");
  };

  const checkAuth = () => {
    const token = useAuthStore.getState().token;
    if (token) {
      apiClient.setToken(token);
    }
    return isAuthenticated;
  };

  return {
    user,
    isAuthenticated,
    login,
    signup,
    logout,
    checkAuth,
  };
}



