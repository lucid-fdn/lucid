'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { createWebhookAction } from '@/lib/forms/actions';
import { useToast } from '@/hooks/use-toast';
import { notificationCopy } from '@/lib/notifications/copy'

interface CreateWebhookDialogProps {
  workflowId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onWebhookCreated: () => void;
}

export function CreateWebhookDialog({
  workflowId,
  open,
  onOpenChange,
  onWebhookCreated,
}: CreateWebhookDialogProps) {
  const toast = useToast();
  const [method, setMethod] = useState<string>('POST');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    try {
      setCreating(true);
      
      const result = await createWebhookAction(workflowId, {
        method,
        description: description || '',
        enabled: true,
      });

      if (result.success) {
        toast.success('Webhook created successfully');
        onWebhookCreated();
        onOpenChange(false);
        // Reset form
        setMethod('POST');
        setDescription('');
      } else {
        toast.error(result.error || 'Failed to create webhook');
      }
    } catch (error) {
      console.error('Error creating webhook:', error);
      toast.error(notificationCopy.common.unexpectedError);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Webhook</DialogTitle>
          <DialogDescription>
            Create a new webhook endpoint to trigger this workflow via HTTP requests.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Method Selector */}
          <div className="space-y-2">
            <Label htmlFor="method">HTTP Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="method">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
                <SelectItem value="PATCH">PATCH</SelectItem>
                <SelectItem value="DELETE">DELETE</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The HTTP method required to trigger this webhook
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              placeholder="e.g., Customer signup webhook"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Help identify this webhook's purpose
            </p>
          </div>

          {/* Info */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950 p-4">
            <p className="text-sm text-blue-900 dark:text-blue-100">
              <strong>Note:</strong> After creation, you'll receive:
            </p>
            <ul className="mt-2 text-xs text-blue-800 dark:text-blue-200 space-y-1 ml-4 list-disc">
              <li>A unique webhook URL</li>
              <li>An API key for authentication</li>
              <li>Example usage code</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating...' : 'Create Webhook'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
