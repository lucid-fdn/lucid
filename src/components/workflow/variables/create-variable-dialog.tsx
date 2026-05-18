'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createVariableAction } from '@/lib/forms/actions';
import { useToast } from '@/hooks/use-toast';
import { notificationCopy } from '@/lib/notifications/copy'

interface CreateVariableDialogProps {
  workflowId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVariableCreated: () => void;
}

export function CreateVariableDialog({
  workflowId,
  open,
  onOpenChange,
  onVariableCreated,
}: CreateVariableDialogProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    key: '',
    value: '',
    type: 'string' as 'string' | 'number' | 'boolean' | 'secret',
    description: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.key.trim()) {
      toast.error(notificationCopy.validation.enterVariableName);
      return;
    }

    if (!formData.value.trim()) {
      toast.error(notificationCopy.validation.enterValue);
      return;
    }

    setLoading(true);

    try {
      const result = await createVariableAction(workflowId, formData);

      if (result.success) {
        toast.success('Variable created successfully');
        onVariableCreated();
        onOpenChange(false);
        // Reset form
        setFormData({
          key: '',
          value: '',
          type: 'string',
          description: '',
        });
      } else {
        toast.error(result.error || 'Failed to create variable');
      }
    } catch (error) {
      console.error('Failed to create variable:', error);
      toast.error(notificationCopy.common.unexpectedError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Create Variable</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Variable Name */}
          <div className="space-y-2">
            <Label htmlFor="key">
              Variable Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="key"
              value={formData.key}
              onChange={(e) => setFormData({ ...formData, key: e.target.value })}
              placeholder="api_url"
              required
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Use in nodes as: <code>{'{{$vars.' + (formData.key || 'name') + '}}'}</code>
            </p>
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select
              value={formData.type}
              onValueChange={(value: string) => setFormData({ ...formData, type: value as 'string' | 'number' | 'boolean' | 'secret' })}
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="string">String</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="boolean">Boolean</SelectItem>
                <SelectItem value="secret">Secret</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {formData.type === 'secret' && 'Secret values are masked in the UI'}
              {formData.type === 'number' && 'Stored as string, converted to number at execution'}
              {formData.type === 'boolean' && 'Use "true" or "false"'}
              {formData.type === 'string' && 'Plain text value'}
            </p>
          </div>

          {/* Value */}
          <div className="space-y-2">
            <Label htmlFor="value">
              Value <span className="text-destructive">*</span>
            </Label>
            {formData.type === 'secret' ? (
              <Input
                id="value"
                type="password"
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                placeholder="Enter secret value"
                required
                disabled={loading}
              />
            ) : (
              <Textarea
                id="value"
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                placeholder="Enter value"
                rows={3}
                required
                disabled={loading}
              />
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What is this variable for?"
              rows={2}
              disabled={loading}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Variable'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
