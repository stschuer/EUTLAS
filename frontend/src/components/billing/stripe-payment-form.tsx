'use client';

import { useState, useEffect } from 'react';
import { loadStripe, type Stripe as StripeType } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/components/ui/use-toast';
import { apiClient } from '@/lib/api-client';
import { CreditCard, CheckCircle2 } from 'lucide-react';

let stripePromise: Promise<StripeType | null> | null = null;

function getStripePromise(publishableKey: string) {
  if (!stripePromise && publishableKey) {
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
}

// Inner form component that uses Stripe hooks
function PaymentMethodForm({
  orgId,
  onSuccess,
  onCancel,
}: {
  orgId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: 'if_required',
      });

      if (error) {
        toast({
          title: 'Payment method failed',
          description: error.message,
          variant: 'destructive',
        });
      } else if (setupIntent && setupIntent.status === 'succeeded') {
        // Confirm with our backend
        try {
          await apiClient.post(`/orgs/${orgId}/billing/payment-method/confirm`, {
            paymentMethodId: setupIntent.payment_method,
          });

          toast({
            title: 'Payment method added',
            description: 'Your payment method has been added successfully.',
          });
          onSuccess();
        } catch (err: any) {
          toast({
            title: 'Error',
            description: err.response?.data?.message || 'Failed to save payment method',
            variant: 'destructive',
          });
        }
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        options={{
          layout: 'tabs',
        }}
      />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isProcessing}>
          Cancel
        </Button>
        <Button type="submit" disabled={!stripe || isProcessing}>
          {isProcessing ? (
            <>
              <LoadingSpinner className="h-4 w-4 mr-2" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="h-4 w-4 mr-2" />
              Add Payment Method
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

// Outer wrapper component that manages Stripe setup
export function StripePaymentForm({
  orgId,
  onSuccess,
  onCancel,
}: {
  orgId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        // Get Stripe config
        const configRes = await apiClient.get(`/orgs/${orgId}/billing/stripe-config`);
        const pk = configRes.data?.data?.publishableKey;

        if (!pk) {
          setError('Stripe is not fully configured. The publishable key is missing. Please contact support.');
          setLoading(false);
          return;
        }

        setPublishableKey(pk);

        // Create setup intent
        const setupRes = await apiClient.post(`/orgs/${orgId}/billing/setup-intent`);
        const cs = setupRes.data?.data?.clientSecret;

        if (!cs) {
          setError('Failed to create payment setup. Please try again.');
          setLoading(false);
          return;
        }

        setClientSecret(cs);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to initialize payment form');
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [orgId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner />
        <span className="ml-2 text-muted-foreground">Setting up payment form...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button variant="outline" onClick={onCancel}>Close</Button>
      </div>
    );
  }

  if (!publishableKey || !clientSecret) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground mb-4">Unable to load payment form.</p>
        <Button variant="outline" onClick={onCancel}>Close</Button>
      </div>
    );
  }

  const stripe = getStripePromise(publishableKey);

  return (
    <Elements
      stripe={stripe}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#2563eb',
            borderRadius: '6px',
          },
        },
      }}
    >
      <PaymentMethodForm orgId={orgId} onSuccess={onSuccess} onCancel={onCancel} />
    </Elements>
  );
}
