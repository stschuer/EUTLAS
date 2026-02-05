"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Database,
  Home,
  Building2,
  FolderKanban,
  Server,
  Settings,
  LogOut,
  User,
  Menu,
  X,
  Activity,
  CreditCard,
  Shield,
  LayoutDashboard,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, token, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !isAuthenticated) {
      router.push("/login");
    } else if (mounted && token) {
      apiClient.setToken(token);
    }
  }, [mounted, isAuthenticated, token, router]);

  useEffect(() => {
    if (!mounted || !isAuthenticated) return;

    // Set up unauthorized handler
    const handleUnauthorized = () => {
      apiClient.setToken(null);
      logout();
      router.push("/login");
    };

    apiClient.setOnUnauthorized(handleUnauthorized);

    // Listen for unauthorized events (fallback)
    window.addEventListener("auth:unauthorized", handleUnauthorized);

    return () => {
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
      apiClient.setOnUnauthorized(null);
    };
  }, [mounted, isAuthenticated, logout, router]);

  const handleLogout = () => {
    apiClient.setToken(null);
    logout();
    router.push("/login");
  };

  // Don't render until mounted to avoid hydration mismatch
  if (!mounted || !isAuthenticated) {
    return null;
  }

  // Context-aware navigation based on current route
  const getNavItems = () => {
    // Extract orgId from pathname if present
    const orgMatch = pathname.match(/\/orgs\/([^\/]+)/);
    const orgId = orgMatch ? orgMatch[1] : null;

    // If we're in an org context, show org-specific nav
    if (orgId) {
      return [
        { href: "/dashboard", icon: Home, label: "Dashboard" },
        { href: "/dashboard/orgs", icon: Building2, label: "Organizations" },
        { href: `/dashboard/orgs/${orgId}`, icon: LayoutDashboard, label: "Org Overview" },
        { href: `/dashboard/orgs/${orgId}/projects`, icon: FolderKanban, label: "Projects" },
        { href: `/dashboard/orgs/${orgId}/activity`, icon: Activity, label: "Activity" },
        { href: `/dashboard/orgs/${orgId}/billing`, icon: CreditCard, label: "Billing" },
        { href: `/dashboard/orgs/${orgId}/audit`, icon: Shield, label: "Audit Logs" },
      ];
    }

    // Default top-level navigation
    return [
      { href: "/dashboard", icon: Home, label: "Dashboard" },
      { href: "/dashboard/orgs", icon: Building2, label: "Organizations" },
    ];
  };

  const navItems = getNavItems();

  // Note: Dashboards are accessible from org pages at /dashboard/orgs/[orgId]/dashboards

  return (
    <TooltipProvider>
    <div className="min-h-screen bg-background flex">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-64 border-r border-border bg-card/50 flex flex-col transform transition-transform lg:transform-none",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="p-4 border-b border-border flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Database className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              EUTLAS
            </span>
          </Link>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close sidebar</TooltipContent>
          </Tooltip>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              icon={<item.icon className="h-5 w-5" />}
              label={item.label}
              isActive={pathname === item.href}
              onClick={() => setSidebarOpen(false)}
            />
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start gap-2">
                <User className="h-4 w-4" />
                <span className="truncate">{user?.email}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur p-4 flex items-center gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open menu</TooltipContent>
          </Tooltip>
          <Link href="/dashboard" className="flex items-center gap-2">
            <Database className="h-6 w-6 text-primary" />
            <span className="font-bold text-primary">EUTLAS</span>
          </Link>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="container mx-auto p-6">{children}</div>
        </main>
      </div>
    </div>
    </TooltipProvider>
  );
}

function NavItem({
  href,
  icon,
  label,
  isActive,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
      )}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
