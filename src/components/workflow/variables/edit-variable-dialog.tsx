'use client';

import { useState, useEffect } from 'react';
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
import { updateVariableAction } from '@/lib/forms/actions';
import { useToast } from '@/hooks/use-toast';
import { notificationCopy } from '@/lib/notifications/copy'

interface Variable {
  id: string;
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'secret';
  is_secret: boolean;
  description: string | null;
}

interface EditVariableDialogProps {
  workflowId: string;
  variable: Variable;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVariableUpdated: () => void;
}

export function EditVariableDialog({
  workflowId,
  variable,
  open,
  onOpenChange,
  onVariableUpdated,
}: EditVariableDialogProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [_actualValue, setActualValue] = useState('');
  const [formData, setFormData] = useState({
    value: variable.value,
    type: variable.type,
    description: variable.description || '',
  });

  // Fetch actual value if secret
  useEffect(() => {
    if (variable.is_secret && open) {
      fetch(`/api/workflows/${workflowId}/variables/${variable.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setActualValue(data.data.value);
            setFormData(prev => ({ ...prev, value: data.data.value }));
          }
        })
        .catch(err => console.error('Failed to fetch variable:', err));
    } else {
      setActualValue(variable.value);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- syncs only on dialog open
  }, [variable.id, variable.is_secret, workflowId, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.value.trim()) {
      toast.error(notificationCopy.validation.enterValue);
      return;
    }

    setLoading(true);

    try {
      const result = await updateVariableAction(workflowId, variable.id, formData);

      if (result.success) {
        toast.success('Variable updated successfully');
        onVariableUpdated();
        onOpenChange(false);
      } else {
        toast.error(result.error || 'Failed to update variable');
      }
    } catch (error) {
      console.error('Failed to update variable:', error);
      toast.error(notificationCopy.common.unexpectedError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit Variable</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Variable Name (Read-only) */}
          <div className="space-y-2">
            <Label>Variable Name</Label>
            <Input
              value={variable.key}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              Variable name cannot be changed
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
            {formData.type === 'secret' || variable.is_secret ? (
              <Input
                id="value"
                type="password"
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                placeholder="Enter new value or leave unchanged"
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
              {loading ? 'Updating...' : 'Update Variable'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
