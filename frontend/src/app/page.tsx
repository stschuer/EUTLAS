"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Database, Shield, Zap, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Database className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              EUTLAS
            </span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost">Login</Button>
            </Link>
            <Link href="/signup">
              <Button className="bg-primary hover:bg-primary/90">
                Get Started
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="pt-32 pb-20">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-4xl mx-auto"
          >
            <h1 className="text-5xl md:text-7xl font-bold mb-6">
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                MongoDB Clusters
              </span>
              <br />
              <span className="text-foreground">Made in Europe</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Deploy fully managed MongoDB clusters on European infrastructure.
              GDPR compliant, high performance, and incredibly simple.
            </p>
            <div className="flex gap-4 justify-center">
              <Link href="/signup">
                <Button size="lg" className="bg-primary hover:bg-primary/90 text-lg px-8">
                  Start Free Trial
                </Button>
              </Link>
              <Link href="#features">
                <Button size="lg" variant="outline" className="text-lg px-8">
                  Learn More
                </Button>
              </Link>
            </div>
          </motion.div>

          {/* Features Grid */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            id="features"
            className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-24"
          >
            <FeatureCard
              icon={<Globe className="h-8 w-8" />}
              title="EU Hosted"
              description="All data stored exclusively in European data centers. Full GDPR compliance."
            />
            <FeatureCard
              icon={<Zap className="h-8 w-8" />}
              title="Lightning Fast"
              description="Deploy clusters in minutes. Scale instantly as your needs grow."
            />
            <FeatureCard
              icon={<Shield className="h-8 w-8" />}
              title="Secure by Default"
              description="Encrypted at rest and in transit. Automated backups included."
            />
            <FeatureCard
              icon={<Database className="h-8 w-8" />}
              title="Fully Managed"
              description="We handle updates, monitoring, and maintenance. You focus on building."
            />
          </motion.div>

          {/* Pricing Preview */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-24 text-center"
          >
            <h2 className="text-3xl font-bold mb-4">Simple, Transparent Pricing</h2>
            <p className="text-muted-foreground mb-8">
              Start from €9/month. No hidden fees.
            </p>
            <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              <PricingCard
                name="Development"
                price="9"
                features={["512MB RAM", "5GB Storage", "Daily Backups", "Community Support"]}
              />
              <PricingCard
                name="Production"
                price="59"
                features={["2GB RAM", "50GB Storage", "Hourly Backups", "Priority Support"]}
                highlighted
              />
              <PricingCard
                name="Enterprise"
                price="229"
                features={["8GB RAM", "200GB Storage", "Point-in-time Recovery", "Dedicated Support"]}
              />
            </div>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>© 2024 EUTLAS. European MongoDB Infrastructure.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 rounded-xl border border-border bg-card/50 hover:bg-card hover:border-primary/50 transition-all duration-300">
      <div className="text-primary mb-4">{icon}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

function PricingCard({
  name,
  price,
  features,
  highlighted,
}: {
  name: string;
  price: string;
  features: string[];
  highlighted?: boolean;
}) {
  return (
    <div
      className={`p-6 rounded-xl border ${
        highlighted
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border bg-card/50"
      } transition-all duration-300`}
    >
      <h3 className="text-lg font-semibold mb-2">{name}</h3>
      <div className="mb-4">
        <span className="text-4xl font-bold">€{price}</span>
        <span className="text-muted-foreground">/mo</span>
      </div>
      <ul className="space-y-2 text-sm text-muted-foreground">
        {features.map((feature) => (
          <li key={feature} className="flex items-center gap-2">
            <span className="text-primary">✓</span>
            {feature}
          </li>
        ))}
      </ul>
      <Button
        className={`w-full mt-6 ${highlighted ? "bg-primary hover:bg-primary/90" : ""}`}
        variant={highlighted ? "default" : "outline"}
      >
        Get Started
      </Button>
    </div>
  );
}





