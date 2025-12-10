'use client';

import { useState } from 'react';
import { useCreateMaintenanceWindow } from '@/hooks/use-maintenance';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';

interface CreateMaintenanceFormProps {
  projectId: string;
  clusterId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const daysOfWeek = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
];

const hours = Array.from({ length: 24 }, (_, i) => ({
  value: i.toString(),
  label: `${i.toString().padStart(2, '0')}:00`,
}));

const timezones = [
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (CET)' },
  { value: 'Europe/London', label: 'Europe/London (GMT)' },
  { value: 'America/New_York', label: 'America/New York (EST)' },
  { value: 'America/Los_Angeles', label: 'America/Los Angeles (PST)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' },
];

export function CreateMaintenanceForm({ projectId, clusterId, onSuccess, onCancel }: CreateMaintenanceFormProps) {
  const [title, setTitle] = useState('Weekly Maintenance Window');
  const [description, setDescription] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState('sunday');
  const [startHour, setStartHour] = useState('3');
  const [durationHours, setDurationHours] = useState('4');
  const [timezone, setTimezone] = useState('UTC');
  const [autoDeferEnabled, setAutoDeferEnabled] = useState(false);

  const { toast } = useToast();
  const createMutation = useCreateMaintenanceWindow();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title) {
      toast({ title: 'Error', description: 'Title is required', variant: 'destructive' });
      return;
    }

    try {
      await createMutation.mutateAsync({
        projectId,
        clusterId,
        data: {
          title,
          description: description || undefined,
          dayOfWeek,
          startHour: parseInt(startHour),
          durationHours: parseInt(durationHours),
          timezone,
          autoDeferEnabled,
        },
      });
      toast({ title: 'Maintenance window created' });
      onSuccess?.();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule Maintenance Window</CardTitle>
        <CardDescription>
          Define when maintenance operations can occur on this cluster
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">Window Name</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Weekly Maintenance Window"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the purpose of this maintenance window"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Day of Week</Label>
              <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {daysOfWeek.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Start Time</Label>
              <Select value={startHour} onValueChange={setStartHour}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {hours.map((h) => (
                    <SelectItem key={h.value} value={h.value}>
                      {h.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Duration (hours)</Label>
              <Select value={durationHours} onValueChange={setDurationHours}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((h) => (
                    <SelectItem key={h} value={h.toString()}>
                      {h} hour{h > 1 ? 's' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timezones.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <Label>Auto-defer during high traffic</Label>
              <p className="text-sm text-muted-foreground">
                Automatically postpone maintenance when cluster is under heavy load
              </p>
            </div>
            <Switch checked={autoDeferEnabled} onCheckedChange={setAutoDeferEnabled} />
          </div>

          <div className="p-4 border rounded-lg bg-blue-50/50 dark:bg-blue-950/20">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Preview:</strong> Maintenance will occur every{' '}
              <strong className="capitalize">{dayOfWeek}</strong> at{' '}
              <strong>{startHour.padStart(2, '0')}:00 {timezone}</strong> for up to{' '}
              <strong>{durationHours} hours</strong>.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Schedule Maintenance
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}


