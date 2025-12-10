"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  Plus,
  Settings,
  Trash2,
  Power,
  Key,
  Users,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api-client";

interface SsoConfig {
  id: string;
  name: string;
  type: "saml" | "oidc";
  enabled: boolean;
  enforced: boolean;
  emailDomains: string[];
  defaultRole: string;
  provider?: string;
  lastUsedAt?: string;
  loginCount: number;
  createdAt: string;
}

export default function SsoSettingsPage() {
  const params = useParams();
  const orgId = params.orgId as string;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newConfig, setNewConfig] = useState({
    name: "",
    type: "oidc" as "saml" | "oidc",
    provider: "google",
    clientId: "",
    clientSecret: "",
    emailDomains: "",
    // SAML fields
    entryPoint: "",
    issuer: "",
    cert: "",
  });
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Fetch SSO configs
  const { data: configs, isLoading } = useQuery({
    queryKey: ["sso-configs", orgId],
    queryFn: async () => {
      const response = await apiClient.get(`/sso/orgs/${orgId}/configs`);
      return response.data as SsoConfig[];
    },
  });

  // Create SSO config
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiClient.post(`/sso/orgs/${orgId}/configs`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso-configs", orgId] });
      setIsCreateOpen(false);
      setNewConfig({
        name: "",
        type: "oidc",
        provider: "google",
        clientId: "",
        clientSecret: "",
        emailDomains: "",
        entryPoint: "",
        issuer: "",
        cert: "",
      });
      toast({ title: "SSO configuration created" });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to create SSO configuration",
        description: error.message,
      });
    },
  });

  // Toggle SSO config
  const toggleMutation = useMutation({
    mutationFn: async ({ configId, enabled }: { configId: string; enabled: boolean }) => {
      return apiClient.put(`/sso/orgs/${orgId}/configs/${configId}`, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso-configs", orgId] });
      toast({ title: "SSO configuration updated" });
    },
  });

  // Delete SSO config
  const deleteMutation = useMutation({
    mutationFn: async (configId: string) => {
      return apiClient.delete(`/sso/orgs/${orgId}/configs/${configId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso-configs", orgId] });
      toast({ title: "SSO configuration deleted" });
    },
  });

  const handleCreate = () => {
    const data: any = {
      name: newConfig.name,
      type: newConfig.type,
      emailDomains: newConfig.emailDomains.split(",").map((d) => d.trim()).filter(Boolean),
    };

    if (newConfig.type === "oidc") {
      data.oidc = {
        provider: newConfig.provider,
        clientId: newConfig.clientId,
        clientSecret: newConfig.clientSecret,
      };
    } else {
      data.saml = {
        entryPoint: newConfig.entryPoint,
        issuer: newConfig.issuer,
        cert: newConfig.cert,
      };
    }

    createMutation.mutate(data);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(id);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const getProviderIcon = (provider?: string) => {
    switch (provider) {
      case "google":
        return "🔵";
      case "microsoft":
        return "🟦";
      case "okta":
        return "🟣";
      case "auth0":
        return "🔴";
      default:
        return "🔐";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Single Sign-On (SSO)
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure SAML 2.0 or OIDC authentication for your organization
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add SSO Provider
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Configure SSO Provider</DialogTitle>
              <DialogDescription>
                Set up Single Sign-On for your organization using SAML 2.0 or OpenID Connect
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Configuration Name</Label>
                  <Input
                    placeholder="Corporate SSO"
                    value={newConfig.name}
                    onChange={(e) => setNewConfig({ ...newConfig, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Protocol</Label>
                  <Select
                    value={newConfig.type}
                    onValueChange={(v) => setNewConfig({ ...newConfig, type: v as "saml" | "oidc" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="oidc">OpenID Connect (OIDC)</SelectItem>
                      <SelectItem value="saml">SAML 2.0</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {newConfig.type === "oidc" && (
                <>
                  <div className="space-y-2">
                    <Label>Identity Provider</Label>
                    <Select
                      value={newConfig.provider}
                      onValueChange={(v) => setNewConfig({ ...newConfig, provider: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="google">🔵 Google Workspace</SelectItem>
                        <SelectItem value="microsoft">🟦 Microsoft Entra ID (Azure AD)</SelectItem>
                        <SelectItem value="okta">🟣 Okta</SelectItem>
                        <SelectItem value="auth0">🔴 Auth0</SelectItem>
                        <SelectItem value="custom">🔐 Custom OIDC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Client ID</Label>
                      <Input
                        placeholder="your-client-id"
                        value={newConfig.clientId}
                        onChange={(e) => setNewConfig({ ...newConfig, clientId: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Client Secret</Label>
                      <Input
                        type="password"
                        placeholder="your-client-secret"
                        value={newConfig.clientSecret}
                        onChange={(e) => setNewConfig({ ...newConfig, clientSecret: e.target.value })}
                      />
                    </div>
                  </div>
                </>
              )}

              {newConfig.type === "saml" && (
                <>
                  <div className="space-y-2">
                    <Label>IdP SSO URL (Entry Point)</Label>
                    <Input
                      placeholder="https://idp.example.com/sso/saml"
                      value={newConfig.entryPoint}
                      onChange={(e) => setNewConfig({ ...newConfig, entryPoint: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>SP Entity ID (Issuer)</Label>
                    <Input
                      placeholder="urn:eutlas:sp"
                      value={newConfig.issuer}
                      onChange={(e) => setNewConfig({ ...newConfig, issuer: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>IdP X.509 Certificate</Label>
                    <Textarea
                      placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                      value={newConfig.cert}
                      onChange={(e) => setNewConfig({ ...newConfig, cert: e.target.value })}
                      rows={4}
                    />
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label>Email Domains (comma-separated)</Label>
                <Input
                  placeholder="company.com, corp.company.com"
                  value={newConfig.emailDomains}
                  onChange={(e) => setNewConfig({ ...newConfig, emailDomains: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Users with these email domains will be automatically prompted to use SSO
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Configuration"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* SSO Configs List */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : configs?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No SSO Configured</h3>
            <p className="text-muted-foreground mb-4">
              Set up Single Sign-On to allow your team to authenticate using your corporate identity provider
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add SSO Provider
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {configs?.map((config) => (
            <Card key={config.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getProviderIcon(config.provider)}</span>
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {config.name}
                        {config.enabled && (
                          <Badge variant="default" className="bg-green-500">Active</Badge>
                        )}
                        {config.enforced && (
                          <Badge variant="outline">Enforced</Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {config.type.toUpperCase()} • {config.provider || "Custom"}
                        {config.emailDomains.length > 0 && (
                          <span> • {config.emailDomains.join(", ")}</span>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={config.enabled}
                      onCheckedChange={(enabled) =>
                        toggleMutation.mutate({ configId: config.id, enabled })
                      }
                    />
                    <Button variant="ghost" size="icon">
                      <Settings className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(config.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total Logins</span>
                    <p className="font-medium">{config.loginCount}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last Used</span>
                    <p className="font-medium">
                      {config.lastUsedAt
                        ? new Date(config.lastUsedAt).toLocaleDateString()
                        : "Never"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Default Role</span>
                    <p className="font-medium">{config.defaultRole}</p>
                  </div>
                </div>

                {/* Setup URLs */}
                <div className="mt-4 pt-4 border-t space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Setup URLs</p>
                  <div className="flex items-center gap-2 bg-muted/50 p-2 rounded text-sm">
                    <code className="flex-1 truncate">
                      {window.location.origin}/api/v1/sso/{config.type}/{config.id}/callback
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() =>
                        copyToClipboard(
                          `${window.location.origin}/api/v1/sso/${config.type}/${config.id}/callback`,
                          `callback-${config.id}`
                        )
                      }
                    >
                      {copiedUrl === `callback-${config.id}` ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                  <a
                    href={`/api/v1/sso/${config.type}/${config.id}/login`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    Test SSO Login <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Info Cards */}
      <div className="grid md:grid-cols-2 gap-4 mt-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-4 w-4" />
              OIDC Providers
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>Supported identity providers:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Google Workspace</li>
              <li>Microsoft Entra ID (Azure AD)</li>
              <li>Okta</li>
              <li>Auth0</li>
              <li>Any OpenID Connect compatible provider</li>
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Just-in-Time Provisioning
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              When enabled, users who authenticate via SSO for the first time will automatically
              be created in EUTLAS and added to your organization with the default role.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


