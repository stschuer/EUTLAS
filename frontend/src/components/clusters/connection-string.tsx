"use client";

import { useState } from "react";
import { Copy, Eye, EyeOff, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

/**
 * Connection String Display Component
 * 
 * Visibility: Important connection info clearly displayed
 * Affordances: Copy buttons look clickable
 * Feedback: Copy confirmation, show/hide toggle
 * Error Tolerance: Password hidden by default
 */

interface ConnectionStringProps {
  connectionString: string;
  host: string;
  port: number;
  username: string;
  password: string;
  status: string;
}

export function ConnectionStringDisplay({
  connectionString,
  host,
  port,
  username,
  password,
  status,
}: ConnectionStringProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const { toast } = useToast();

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      toast({
        title: "Copied!",
        description: `${fieldName} copied to clipboard.`,
      });
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Copy failed",
        description: "Please copy manually.",
      });
    }
  };

  const isPending = status !== "ready";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ExternalLink className="h-5 w-5 text-primary" />
          Connection Details
        </CardTitle>
        <CardDescription>
          Use these credentials to connect to your MongoDB cluster.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Connection String - Most important */}
        <div className="space-y-2">
          <Label>Connection String</Label>
          <div className="flex gap-2">
            <Input
              readOnly
              value={isPending ? "Waiting for cluster to be ready..." : connectionString}
              className={cn(
                "font-mono text-sm",
                isPending && "text-muted-foreground"
              )}
            />
            <CopyButton
              onClick={() => copyToClipboard(connectionString, "Connection String")}
              copied={copiedField === "Connection String"}
              disabled={isPending}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Use this connection string in your application.
          </p>
        </div>

        {/* Individual credentials */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Host */}
          <div className="space-y-2">
            <Label>Host</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={isPending ? "pending" : host}
                className={cn("font-mono text-sm", isPending && "text-muted-foreground")}
              />
              <CopyButton
                onClick={() => copyToClipboard(host, "Host")}
                copied={copiedField === "Host"}
                disabled={isPending}
              />
            </div>
          </div>

          {/* Port */}
          <div className="space-y-2">
            <Label>Port</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={isPending ? "pending" : port.toString()}
                className={cn("font-mono text-sm", isPending && "text-muted-foreground")}
              />
              <CopyButton
                onClick={() => copyToClipboard(port.toString(), "Port")}
                copied={copiedField === "Port"}
                disabled={isPending}
              />
            </div>
          </div>

          {/* Username */}
          <div className="space-y-2">
            <Label>Username</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={isPending ? "pending" : username}
                className={cn("font-mono text-sm", isPending && "text-muted-foreground")}
              />
              <CopyButton
                onClick={() => copyToClipboard(username, "Username")}
                copied={copiedField === "Username"}
                disabled={isPending}
              />
            </div>
          </div>

          {/* Password - Hidden by default for security */}
          <div className="space-y-2">
            <Label>Password</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  readOnly
                  type={showPassword ? "text" : "password"}
                  value={isPending ? "pending" : password}
                  className={cn(
                    "font-mono text-sm pr-10",
                    isPending && "text-muted-foreground"
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isPending}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <CopyButton
                onClick={() => copyToClipboard(password, "Password")}
                copied={copiedField === "Password"}
                disabled={isPending}
              />
            </div>
          </div>
        </div>

        {/* Code examples */}
        <div className="rounded-lg border bg-muted/30 p-4">
          <h4 className="text-sm font-medium mb-2">Quick Start</h4>
          <pre className="text-xs text-muted-foreground overflow-x-auto">
            <code>{`// Node.js
const { MongoClient } = require('mongodb');
const client = new MongoClient('${isPending ? "..." : connectionString}');`}</code>
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Copy Button with feedback
 */
function CopyButton({
  onClick,
  copied,
  disabled,
}: {
  onClick: () => void;
  copied: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      className="shrink-0"
    >
      {copied ? (
        <Check className="h-4 w-4 text-primary" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </Button>
  );
}





