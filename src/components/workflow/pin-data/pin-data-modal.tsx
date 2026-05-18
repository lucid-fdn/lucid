'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, Check } from 'lucide-react';
import { useCanvasStore } from '@/stores/workflow/canvas.store';
import { toast } from '@/hooks/use-toast';

interface PinDataModalProps {
  nodeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SAMPLE_DATA_TEMPLATES = {
  'Single Item': JSON.stringify([
    {
      id: 1,
      name: 'Sample Item',
      email: 'sample@example.com',
      status: 'active'
    }
  ], null, 2),
  'Multiple Items': JSON.stringify([
    { id: 1, name: 'Item 1', value: 100 },
    { id: 2, name: 'Item 2', value: 200 },
    { id: 3, name: 'Item 3', value: 300 }
  ], null, 2),
  'API Response': JSON.stringify([
    {
      status: 200,
      data: {
        users: [
          { id: 1, username: 'john_doe' },
          { id: 2, username: 'jane_smith' }
        ]
      },
      timestamp: '2025-10-17T10:00:00Z'
    }
  ], null, 2),
  'Empty Array': JSON.stringify([], null, 2)
};

export function PinDataModal({ nodeId, open, onOpenChange }: PinDataModalProps) {
  const { nodes, updateNode } = useCanvasStore();
  const node = nodes.find(n => n.id === nodeId);
  
  const [jsonData, setJsonData] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  
  // Initialize with existing pinned data or empty array
  useEffect(() => {
    if (open && node) {
      const existingData = node.data?.pinnedData;
      if (existingData) {
        setJsonData(JSON.stringify(existingData, null, 2));
      } else {
        setJsonData(JSON.stringify([], null, 2));
      }
      setError(null);
      setActiveTemplate(null);
    }
  }, [open, node]);
  
  const validateJSON = (value: string): boolean => {
    try {
      const parsed = JSON.parse(value);
      
      // Must be an array
      if (!Array.isArray(parsed)) {
        setError('Pin data must be an array of items');
        return false;
      }
      
      setError(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON');
      return false;
    }
  };
  
  const handleSave = () => {
    if (!validateJSON(jsonData)) {
      return;
    }
    
    try {
      const parsed = JSON.parse(jsonData);
      
      // Update node with pinned data
      updateNode(nodeId, {
        data: {
          ...node?.data,
          pinnedData: parsed
        }
      });
      
      toast.success('Pin data saved');
      onOpenChange(false);
    } catch (_e) {
      toast.error('Failed to save pin data');
    }
  };
  
  const handleClear = () => {
    updateNode(nodeId, {
      data: {
        ...node?.data,
        pinnedData: null
      }
    });
    
    toast.success('Pin data cleared');
    onOpenChange(false);
  };
  
  const handleTemplateSelect = (template: string) => {
    setJsonData(SAMPLE_DATA_TEMPLATES[template as keyof typeof SAMPLE_DATA_TEMPLATES]);
    setActiveTemplate(template);
    validateJSON(SAMPLE_DATA_TEMPLATES[template as keyof typeof SAMPLE_DATA_TEMPLATES]);
  };
  
  const handleChange = (value: string) => {
    setJsonData(value);
    setActiveTemplate(null);
    validateJSON(value);
  };
  
  if (!node) return null;
  
  const hasPinnedData = node.data?.pinnedData !== undefined && node.data?.pinnedData !== null;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Pin Test Data</DialogTitle>
          <DialogDescription>
            Pin sample data to test this node without executing previous nodes.
            Data must be in JSON array format.
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="editor" className="flex-1">
          <TabsList>
            <TabsTrigger value="editor">Editor</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>
          
          <TabsContent value="editor" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="json-data">JSON Data</Label>
              <Textarea
                id="json-data"
                value={jsonData}
                onChange={(e) => handleChange(e.target.value)}
                placeholder="Enter JSON array..."
                className="font-mono text-sm min-h-[300px]"
              />
            </div>
            
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950 p-3 rounded">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            
            {!error && jsonData && (
              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-950 p-3 rounded">
                <Check className="h-4 w-4 flex-shrink-0" />
                <span>Valid JSON array</span>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="templates" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {Object.keys(SAMPLE_DATA_TEMPLATES).map((template) => (
                <Button
                  key={template}
                  variant={activeTemplate === template ? "default" : "outline"}
                  onClick={() => handleTemplateSelect(template)}
                  className="h-auto p-4 flex flex-col items-start"
                >
                  <span className="font-medium">{template}</span>
                  <span className="text-xs text-muted-foreground mt-1">
                    Click to use this template
                  </span>
                </Button>
              ))}
            </div>
          </TabsContent>
        </Tabs>
        
        <DialogFooter>
          {hasPinnedData && (
            <Button variant="destructive" onClick={handleClear}>
              Clear Pin Data
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!!error || !jsonData}>
            Save Pin Data
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
