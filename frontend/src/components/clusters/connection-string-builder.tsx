'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Eye, EyeOff, Code, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConnectionCredentials {
  connectionString: string;
  host: string;
  port: number;
  username: string;
  password: string;
}

interface ConnectionStringBuilderProps {
  clusterName: string;
  credentials: ConnectionCredentials;
}

type Language = 'mongodb' | 'node' | 'python' | 'go' | 'java' | 'rust' | 'php' | 'csharp';

const LANGUAGES: { id: Language; name: string; icon: string }[] = [
  { id: 'mongodb', name: 'MongoDB Shell', icon: '🍃' },
  { id: 'node', name: 'Node.js', icon: '⬢' },
  { id: 'python', name: 'Python', icon: '🐍' },
  { id: 'go', name: 'Go', icon: '🐹' },
  { id: 'java', name: 'Java', icon: '☕' },
  { id: 'rust', name: 'Rust', icon: '🦀' },
  { id: 'php', name: 'PHP', icon: '🐘' },
  { id: 'csharp', name: 'C#', icon: '#' },
];

function generateCode(
  language: Language,
  credentials: ConnectionCredentials,
  clusterName: string,
): string {
  const { host, port, username, password } = credentials;
  const connectionUri = `mongodb://${username}:${password}@${host}:${port}/${clusterName}?authSource=admin`;

  switch (language) {
    case 'mongodb':
      return `mongosh "${connectionUri}"`;

    case 'node':
      return `const { MongoClient } = require('mongodb');

const uri = "${connectionUri}";
const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB!");
    
    const database = client.db("${clusterName}");
    // Start using your database...
    
  } finally {
    await client.close();
  }
}

run().catch(console.dir);`;

    case 'python':
      return `from pymongo import MongoClient

uri = "${connectionUri}"
client = MongoClient(uri)

# Get database
db = client["${clusterName}"]

# Start using your database
# collection = db["your_collection"]
# result = collection.find_one()

print("Connected to MongoDB!")`;

    case 'go':
      return `package main

import (
    "context"
    "fmt"
    "log"
    "go.mongodb.org/mongo-driver/mongo"
    "go.mongodb.org/mongo-driver/mongo/options"
)

func main() {
    uri := "${connectionUri}"
    
    client, err := mongo.Connect(context.TODO(), options.Client().ApplyURI(uri))
    if err != nil {
        log.Fatal(err)
    }
    defer client.Disconnect(context.TODO())

    // Ping the database
    err = client.Ping(context.TODO(), nil)
    if err != nil {
        log.Fatal(err)
    }
    
    fmt.Println("Connected to MongoDB!")
    
    // Get database
    db := client.Database("${clusterName}")
    _ = db // Use your database
}`;

    case 'java':
      return `import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoDatabase;

public class MongoDBConnection {
    public static void main(String[] args) {
        String uri = "${connectionUri}";
        
        try (MongoClient mongoClient = MongoClients.create(uri)) {
            MongoDatabase database = mongoClient.getDatabase("${clusterName}");
            System.out.println("Connected to MongoDB!");
            
            // Start using your database...
        }
    }
}`;

    case 'rust':
      return `use mongodb::{Client, options::ClientOptions};

#[tokio::main]
async fn main() -> mongodb::error::Result<()> {
    let uri = "${connectionUri}";
    
    let client_options = ClientOptions::parse(uri).await?;
    let client = Client::with_options(client_options)?;
    
    // Get database
    let db = client.database("${clusterName}");
    
    println!("Connected to MongoDB!");
    
    // Start using your database...
    
    Ok(())
}`;

    case 'php':
      return `<?php

require 'vendor/autoload.php';

$uri = "${connectionUri}";

$client = new MongoDB\\Client($uri);

$database = $client->selectDatabase("${clusterName}");

echo "Connected to MongoDB!\\n";

// Start using your database
// $collection = $database->selectCollection("your_collection");
// $document = $collection->findOne();`;

    case 'csharp':
      return `using MongoDB.Driver;

var uri = "${connectionUri}";
var client = new MongoClient(uri);

var database = client.GetDatabase("${clusterName}");

Console.WriteLine("Connected to MongoDB!");

// Start using your database
// var collection = database.GetCollection<BsonDocument>("your_collection");`;

    default:
      return connectionUri;
  }
}

export function ConnectionStringBuilder({
  clusterName,
  credentials,
}: ConnectionStringBuilderProps) {
  const [selectedLanguage, setSelectedLanguage] = useState<Language>('node');
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedUri, setCopiedUri] = useState(false);

  const code = generateCode(selectedLanguage, credentials, clusterName);
  const displayCode = showPassword 
    ? code 
    : code.replace(credentials.password, '••••••••••••');

  const handleCopy = async (text: string, isUri = false) => {
    await navigator.clipboard.writeText(text);
    if (isUri) {
      setCopiedUri(true);
      setTimeout(() => setCopiedUri(false), 2000);
    } else {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Code className="h-5 w-5 text-primary" />
              Connection String
            </CardTitle>
            <CardDescription className="mt-1">
              Choose your language and copy the connection code
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPassword(!showPassword)}
            className="gap-1.5"
          >
            {showPassword ? (
              <>
                <EyeOff className="h-4 w-4" />
                Hide
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" />
                Show
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Copy URI */}
        <div className="rounded-lg bg-muted/50 p-3 font-mono text-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate flex-1 text-muted-foreground">
              {showPassword 
                ? credentials.connectionString 
                : credentials.connectionString.replace(credentials.password, '••••••••••••')}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleCopy(credentials.connectionString, true)}
              className="shrink-0"
            >
              {copiedUri ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Language Selector */}
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((lang) => (
            <Badge
              key={lang.id}
              variant={selectedLanguage === lang.id ? 'default' : 'outline'}
              className={cn(
                'cursor-pointer transition-all hover:scale-105',
                selectedLanguage === lang.id && 'bg-primary text-primary-foreground'
              )}
              onClick={() => setSelectedLanguage(lang.id)}
            >
              <span className="mr-1.5">{lang.icon}</span>
              {lang.name}
            </Badge>
          ))}
        </div>

        {/* Code Block */}
        <div className="relative rounded-lg bg-zinc-950 text-zinc-100 border border-zinc-800">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
            <span className="text-xs text-zinc-400">
              {LANGUAGES.find((l) => l.id === selectedLanguage)?.name}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleCopy(code)}
              className="h-7 gap-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-xs">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span className="text-xs">Copy</span>
                </>
              )}
            </Button>
          </div>
          <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
            <code>{displayCode}</code>
          </pre>
        </div>

        {/* Connection Details */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Host</div>
            <div className="font-mono text-sm truncate">{credentials.host}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Port</div>
            <div className="font-mono text-sm">{credentials.port}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Username</div>
            <div className="font-mono text-sm">{credentials.username}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Database</div>
            <div className="font-mono text-sm">{clusterName}</div>
          </div>
        </div>

        {/* Documentation Links */}
        <div className="flex items-center gap-4 pt-2 border-t border-border/50">
          <a
            href="https://www.mongodb.com/docs/drivers/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Driver Documentation
          </a>
          <a
            href="https://www.mongodb.com/docs/manual/reference/connection-string/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Connection String Reference
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

export default ConnectionStringBuilder;





