'use client';

import { AlertTriangle, UserX } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { apiClient } from '@/lib/api-client';
import { useState } from 'react';

export function ImpersonationBanner() {
  const { impersonation, setAuth, clearImpersonation } = useAuthStore();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  if (!impersonation) {
    return null;
  }

  const handleStopImpersonating = async () => {
    try {
      setIsLoading(true);

      const response = await apiClient.post('/auth/stop-impersonating', {});

      if (response.data.success && response.data.data) {
        // Update auth with admin's token
        setAuth(
          response.data.data.user,
          response.data.data.accessToken,
          undefined // Clear impersonation
        );

        toast({
          title: 'Impersonation Ended',
          description: `Returned to your admin account (${impersonation.originalAdminEmail})`,
        });
      } else {
        // Just clear impersonation state if API doesn't return new token
        clearImpersonation();
        
        toast({
          title: 'Impersonation Ended',
          description: 'You are no longer impersonating a user.',
        });
      }
    } catch (error: any) {
      console.error('Failed to stop impersonating:', error);
      
      // Even if the API call fails, clear the impersonation state
      clearImpersonation();
      
      toast({
        title: 'Warning',
        description: 'Impersonation state cleared. Please refresh if you experience issues.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-amber-500 text-white px-4 py-3 shadow-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <span className="font-semibold">You are impersonating:</span>
            <span className="text-sm opacity-90">
              Logged in as <strong>{useAuthStore.getState().user?.email}</strong>
            </span>
            {impersonation.originalAdminEmail && (
              <span className="text-xs opacity-75">
                (Admin: {impersonation.originalAdminEmail})
              </span>
            )}
          </div>
        </div>
        <Button
          onClick={handleStopImpersonating}
          disabled={isLoading}
          variant="outline"
          size="sm"
          className="bg-white text-amber-600 hover:bg-amber-50 hover:text-amber-700 border-amber-200 flex-shrink-0"
        >
          <UserX className="h-4 w-4 mr-2" />
          {isLoading ? 'Stopping...' : 'Stop Impersonating'}
        </Button>
      </div>
    </div>
  );
}
