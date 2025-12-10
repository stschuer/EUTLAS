'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import {
  Compass,
  Copy,
  ExternalLink,
  CheckCircle,
  Terminal,
  Download,
} from 'lucide-react';

interface CompassConnectionProps {
  cluster: {
    id: string;
    name: string;
    hostname?: string;
    port?: number;
  };
  credentials: {
    connectionString?: string;
    host?: string;
    port?: number;
  };
}

export function CompassConnection({ cluster, credentials }: CompassConnectionProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);

  const connectionString = credentials.connectionString || 
    `mongodb://<username>:<password>@${credentials.host || cluster.hostname || 'localhost'}:${credentials.port || cluster.port || 27017}/?authSource=admin`;

  const mongoShellCommand = `mongosh "${connectionString.replace('<password>', '****')}"`;
  
  // Compass URL scheme for direct opening
  const compassUrl = `mongodb-compass://?connectionString=${encodeURIComponent(connectionString)}`;

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    toast({ title: 'Copied!', description: `${label} copied to clipboard` });
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-green-600" />
          <CardTitle>MongoDB Compass</CardTitle>
        </div>
        <CardDescription>
          Connect to your cluster using MongoDB Compass GUI
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Quick Connect */}
        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg p-4">
          <h4 className="font-medium text-green-800 dark:text-green-200 mb-2">Quick Connect</h4>
          <p className="text-sm text-green-700 dark:text-green-300 mb-3">
            Open MongoDB Compass directly with your connection settings:
          </p>
          <div className="flex gap-2">
            <Button 
              className="bg-green-600 hover:bg-green-700"
              onClick={() => window.open(compassUrl, '_blank')}
            >
              <Compass className="h-4 w-4 mr-2" />
              Open in Compass
            </Button>
            <Button variant="outline" asChild>
              <a href="https://www.mongodb.com/try/download/compass" target="_blank" rel="noopener noreferrer">
                <Download className="h-4 w-4 mr-2" />
                Download Compass
              </a>
            </Button>
          </div>
        </div>

        {/* Connection String */}
        <div className="space-y-2">
          <Label>Connection String</Label>
          <div className="flex gap-2">
            <Input 
              value={connectionString} 
              readOnly 
              className="font-mono text-sm"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(connectionString, 'Connection string')}
            >
              {copied === 'Connection string' ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Replace &lt;username&gt; and &lt;password&gt; with your database user credentials
          </p>
        </div>

        {/* mongosh Command */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            MongoDB Shell (mongosh)
          </Label>
          <div className="bg-zinc-900 text-zinc-100 p-3 rounded-lg font-mono text-sm overflow-x-auto">
            <code>{mongoShellCommand}</code>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => copyToClipboard(mongoShellCommand, 'Shell command')}
          >
            {copied === 'Shell command' ? (
              <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            Copy Command
          </Button>
        </div>

        {/* Connection Steps */}
        <div className="space-y-3">
          <h4 className="font-medium">Manual Connection Steps</h4>
          <ol className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <Badge variant="outline" className="mt-0.5">1</Badge>
              <span>Open MongoDB Compass</span>
            </li>
            <li className="flex items-start gap-2">
              <Badge variant="outline" className="mt-0.5">2</Badge>
              <span>Click "New Connection" or use the connection string field</span>
            </li>
            <li className="flex items-start gap-2">
              <Badge variant="outline" className="mt-0.5">3</Badge>
              <span>Paste the connection string above</span>
            </li>
            <li className="flex items-start gap-2">
              <Badge variant="outline" className="mt-0.5">4</Badge>
              <span>Replace &lt;username&gt; and &lt;password&gt; with your credentials</span>
            </li>
            <li className="flex items-start gap-2">
              <Badge variant="outline" className="mt-0.5">5</Badge>
              <span>Click "Connect"</span>
            </li>
          </ol>
        </div>

        {/* Requirements */}
        <div className="bg-muted/50 rounded-lg p-4">
          <h4 className="font-medium mb-2">Requirements</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• MongoDB Compass 1.30+ recommended</li>
            <li>• Your IP must be in the cluster's whitelist</li>
            <li>• Valid database user credentials required</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}


