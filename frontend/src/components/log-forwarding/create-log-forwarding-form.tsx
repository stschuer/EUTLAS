'use client';

import { useState } from 'react';
import { useCreateLogForwarding, useLogForwardingDestinations } from '@/hooks/use-log-forwarding';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';

interface CreateLogForwardingFormProps {
  projectId: string;
  clusterId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const destinationCards = [
  { type: 's3', name: 'Amazon S3', icon: '🪣', description: 'Store logs in S3 bucket' },
  { type: 'datadog', name: 'Datadog', icon: '🐕', description: 'Stream to Datadog' },
  { type: 'splunk', name: 'Splunk', icon: '🔍', description: 'Forward to Splunk HEC' },
  { type: 'webhook', name: 'Webhook', icon: '🔗', description: 'Custom HTTP endpoint' },
];

const logTypes = [
  { id: 'mongodb', label: 'MongoDB Logs' },
  { id: 'audit', label: 'Audit Logs' },
  { id: 'profiler', label: 'Profiler Logs' },
];

export function CreateLogForwardingForm({ projectId, clusterId, onSuccess, onCancel }: CreateLogForwardingFormProps) {
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<string>('');
  const [name, setName] = useState('');
  const [selectedLogTypes, setSelectedLogTypes] = useState<string[]>(['mongodb']);
  
  // S3 config
  const [s3Bucket, setS3Bucket] = useState('');
  const [s3Region, setS3Region] = useState('eu-central-1');
  const [s3AccessKey, setS3AccessKey] = useState('');
  const [s3SecretKey, setS3SecretKey] = useState('');
  
  // Datadog config
  const [datadogSite, setDatadogSite] = useState('datadoghq.eu');
  const [datadogApiKey, setDatadogApiKey] = useState('');
  
  // Splunk config
  const [splunkHost, setSplunkHost] = useState('');
  const [splunkPort, setSplunkPort] = useState('8088');
  const [splunkToken, setSplunkToken] = useState('');
  
  // Webhook config
  const [webhookUrl, setWebhookUrl] = useState('');

  const { toast } = useToast();
  const createMutation = useCreateLogForwarding();

  const handleSubmit = async () => {
    if (!name || !selectedType) {
      toast({ title: 'Error', description: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }

    const data: any = {
      name,
      destinationType: selectedType,
      logTypes: selectedLogTypes,
      enabled: true,
    };

    switch (selectedType) {
      case 's3':
        if (!s3Bucket || !s3Region) {
          toast({ title: 'Error', description: 'S3 bucket and region are required', variant: 'destructive' });
          return;
        }
        data.s3Config = {
          bucketName: s3Bucket,
          region: s3Region,
          accessKeyId: s3AccessKey || undefined,
          secretAccessKey: s3SecretKey || undefined,
        };
        break;
      case 'datadog':
        if (!datadogSite || !datadogApiKey) {
          toast({ title: 'Error', description: 'Datadog site and API key are required', variant: 'destructive' });
          return;
        }
        data.datadogConfig = {
          site: datadogSite,
          apiKey: datadogApiKey,
        };
        break;
      case 'splunk':
        if (!splunkHost || !splunkToken) {
          toast({ title: 'Error', description: 'Splunk host and HEC token are required', variant: 'destructive' });
          return;
        }
        data.splunkConfig = {
          host: splunkHost,
          port: parseInt(splunkPort),
          hecToken: splunkToken,
        };
        break;
      case 'webhook':
        if (!webhookUrl) {
          toast({ title: 'Error', description: 'Webhook URL is required', variant: 'destructive' });
          return;
        }
        data.webhookConfig = { url: webhookUrl };
        break;
    }

    try {
      await createMutation.mutateAsync({ projectId, clusterId, data });
      toast({ title: 'Log forwarding configured' });
      onSuccess?.();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configure Log Forwarding</CardTitle>
        <CardDescription>
          {step === 1 && 'Choose where to send your logs'}
          {step === 2 && `Configure ${selectedType} settings`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {destinationCards.map((dest) => (
                <Card
                  key={dest.type}
                  className={`cursor-pointer transition-all ${selectedType === dest.type ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground/50'}`}
                  onClick={() => setSelectedType(dest.type)}
                >
                  <CardContent className="p-4 text-center">
                    <div className="text-3xl mb-2">{dest.icon}</div>
                    <div className="font-medium">{dest.name}</div>
                    <div className="text-xs text-muted-foreground">{dest.description}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Configuration Name</Label>
              <Input
                placeholder="My Log Destination"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Log Types</Label>
              <div className="flex flex-wrap gap-4">
                {logTypes.map((lt) => (
                  <label key={lt.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedLogTypes.includes(lt.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedLogTypes([...selectedLogTypes, lt.id]);
                        } else {
                          setSelectedLogTypes(selectedLogTypes.filter((t) => t !== lt.id));
                        }
                      }}
                    />
                    {lt.label}
                  </label>
                ))}
              </div>
            </div>

            {/* S3 Config */}
            {selectedType === 's3' && (
              <div className="space-y-4 pt-4 border-t">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Bucket Name *</Label>
                    <Input value={s3Bucket} onChange={(e) => setS3Bucket(e.target.value)} placeholder="my-logs-bucket" />
                  </div>
                  <div className="space-y-2">
                    <Label>Region *</Label>
                    <Input value={s3Region} onChange={(e) => setS3Region(e.target.value)} placeholder="eu-central-1" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Access Key ID</Label>
                    <Input value={s3AccessKey} onChange={(e) => setS3AccessKey(e.target.value)} placeholder="AKIA..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Secret Access Key</Label>
                    <Input type="password" value={s3SecretKey} onChange={(e) => setS3SecretKey(e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {/* Datadog Config */}
            {selectedType === 'datadog' && (
              <div className="space-y-4 pt-4 border-t">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Datadog Site *</Label>
                    <Input value={datadogSite} onChange={(e) => setDatadogSite(e.target.value)} placeholder="datadoghq.eu" />
                  </div>
                  <div className="space-y-2">
                    <Label>API Key *</Label>
                    <Input type="password" value={datadogApiKey} onChange={(e) => setDatadogApiKey(e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {/* Splunk Config */}
            {selectedType === 'splunk' && (
              <div className="space-y-4 pt-4 border-t">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Splunk Host *</Label>
                    <Input value={splunkHost} onChange={(e) => setSplunkHost(e.target.value)} placeholder="splunk.example.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>HEC Port</Label>
                    <Input value={splunkPort} onChange={(e) => setSplunkPort(e.target.value)} placeholder="8088" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>HEC Token *</Label>
                  <Input type="password" value={splunkToken} onChange={(e) => setSplunkToken(e.target.value)} />
                </div>
              </div>
            )}

            {/* Webhook Config */}
            {selectedType === 'webhook' && (
              <div className="space-y-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label>Webhook URL *</Label>
                  <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://example.com/logs" />
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={step === 1 ? onCancel : () => setStep(1)}>
          {step === 1 ? 'Cancel' : 'Back'}
        </Button>
        {step === 1 ? (
          <Button onClick={() => setStep(2)} disabled={!selectedType}>
            Next
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}


