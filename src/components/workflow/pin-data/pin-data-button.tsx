'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Pin, PinOff } from 'lucide-react';
import { useCanvasStore } from '@/stores/workflow/canvas.store';
import { PinDataModal } from './pin-data-modal';
import { cn } from '@/lib/utils';

interface PinDataButtonProps {
  nodeId: string;
}

export function PinDataButton({ nodeId }: PinDataButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const nodes = useCanvasStore((state) => state.nodes);
  
  const node = nodes.find(n => n.id === nodeId);
  const hasPinnedData = node?.data?.pinnedData !== undefined && node?.data?.pinnedData !== null;
  
  return (
    <>
      <Button
        variant={hasPinnedData ? "default" : "outline"}
        size="sm"
        onClick={() => setModalOpen(true)}
        className={cn(
          "gap-2",
          hasPinnedData && "bg-blue-600 hover:bg-blue-700"
        )}
      >
        {hasPinnedData ? (
          <>
            <Pin className="h-4 w-4" />
            Pinned
          </>
        ) : (
          <>
            <PinOff className="h-4 w-4" />
            Pin Data
          </>
        )}
      </Button>
      
      <PinDataModal
        nodeId={nodeId}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </>
  );
}
