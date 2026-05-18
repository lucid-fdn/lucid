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
import { createVariableAction, updateVariableAction } from '@/lib/forms/actions';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff } from 'lucide-react';
import { notificationCopy } from '@/lib/notifications/copy'

interface Variable {
  id: string;
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'secret';
  description: string | null;
  is_secret: boolean;
}

interface VariableDialogProps {
  workflowId: string;
  variable?: Variable | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function VariableDialog({
  workflowId,
  variable,
  open,
  onOpenChange,
  onSuccess,
}: VariableDialogProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [formData, setFormData] = useState<{
    key: string;
    value: string;
    type: 'string' | 'number' | 'boolean' | 'secret';
    description: string;
  }>({
    key: '',
    value: '',
    type: 'string',
    description: '',
  });

  // Load variable data when editing
  useEffect(() => {
    if (variable) {
      // Fetch unmasked value for editing
      fetch(`/api/workflows/${workflowId}/variables/${variable.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setFormData({
              key: data.data.key,
              value: data.data.value,
              type: data.data.type,
              description: data.data.description || '',
            });
          }
        });
    } else {
      setFormData({
        key: '',
        value: '',
        type: 'string',
        description: '',
      });
    }
  }, [variable, workflowId]);

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
      const result = variable
        ? await updateVariableAction(workflowId, variable.id, {
            value: formData.value,
            type: formData.type,
            description: formData.description,
          })
        : await createVariableAction(workflowId, formData);

      if (result.success) {
        toast.success(variable ? 'Variable updated' : 'Variable created');
        onSuccess();
        onOpenChange(false);
        if (!variable) {
          setFormData({
            key: '',
            value: '',
            type: 'string',
            description: '',
          });
        }
      } else {
        toast.error(result.error || 'Failed to save variable');
      }
    } catch (error) {
      console.error('Failed to save variable:', error);
      toast.error(notificationCopy.common.unexpectedError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{variable ? 'Edit Variable' : 'Add Variable'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="key">Variable Name</Label>
            <Input
              id="key"
              value={formData.key}
              onChange={(e) => setFormData({ ...formData, key: e.target.value })}
              placeholder="MY_VARIABLE"
              disabled={!!variable}
              required
            />
          </div>

          <div>
            <Label htmlFor="type">Type</Label>
            <Select
              value={formData.type}
              onValueChange={(value: string) => setFormData({ ...formData, type: value as 'string' | 'number' | 'boolean' | 'secret' })}
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
          </div>

          <div>
            <Label htmlFor="value">Value</Label>
            <div className="relative">
              {formData.type === 'secret' ? (
                <>
                  <Input
                    id="value"
                    type={showSecret ? 'text' : 'password'}
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </>
              ) : (
                <Input
                  id="value"
                  value={formData.value}
                  onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                  required
                />
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What is this variable used for?"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : variable ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
