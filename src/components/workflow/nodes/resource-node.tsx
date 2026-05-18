import { memo } from 'react';
import Image from 'next/image';
import { Handle, Position, type NodeProps } from 'reactflow';
import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';
import { getLucidL2IconUrl } from '@/lib/lucid-l2/config';

interface ResourceNodeData {
  label: string;
  type: string;
  category?: string;
  icon?: string;
  iconUrl?: string | { light: string; dark: string };
  config?: Record<string, unknown>;
  hasError?: boolean;
  subLabel?: string;
}

/**
 * ResourceNode - Small circular node for Tools/Data/Models
 * Used for: Chat Models, Memory, Tools that connect to AI Agent
 * Features:
 * - Small circular design (96px diameter)
 * - Icon in center
 * - Top handle for connection
 * - Label below
 * - Error indicator
 */
export const ResourceNode = memo(({ data, selected }: NodeProps<ResourceNodeData>) => {
  const iconUrl = data.iconUrl;
  const hasError = data.hasError || false;

  // Get display labels
  const getMainLabel = () => {
    const labelStr = typeof data.label === 'string' ? data.label : String(data.label);
    
    // Check if user has set a custom label
    const hasCustomLabel = labelStr && !labelStr.includes(':');
    if (hasCustomLabel) return labelStr;
    
    // Check if action is selected (has colon)
    const hasAction = labelStr && labelStr.includes(':');
    if (hasAction) {
      const parts = labelStr.split(':');
      return parts[0]?.trim() || 'Resource';
    }
    
    return 'Resource';
  };

  const getSubLabel = () => {
    if (data.subLabel) return data.subLabel;
    
    const labelStr = typeof data.label === 'string' ? data.label : String(data.label);
    if (labelStr && labelStr.includes(':')) {
      const parts = labelStr.split(':');
      return parts.slice(1).join(':').trim() || '';
    }
    return '';
  };

  return (
    <div className="relative">
      {/* Top Handle - for connection to AI Agent */}
      <Handle
        type="source"
        position={Position.Top}
        className="w-3 h-3 !bg-muted-foreground !-translate-y-1/2 !border-2 !border-border"
        style={{ top: 0 }}
      />

      {/* Main Circular Node - 40% smaller */}
      <div
        className={cn(
          'w-14 h-14 rounded-full border-2 bg-gradient-to-br from-popover/95 to-muted/95 backdrop-blur-xl shadow-2xl',
          'flex items-center justify-center relative',
          selected ? 'border-primary ring-2 ring-primary/20' : 'border-border/50',
          'hover:border-primary/50 transition-all duration-300'
        )}
      >
        {/* Error Indicator */}
        {hasError && (
          <div className="absolute bottom-0.5 right-0.5 bg-red-500 rounded-full p-0.5 z-10">
            <AlertTriangle className="w-2 h-2 text-white" />
          </div>
        )}

        {/* Icon */}
        <div className="w-8 h-8 flex items-center justify-center">
          {iconUrl && typeof iconUrl === 'object' && 'light' in iconUrl && iconUrl.light ? (
            <Image
              src={getLucidL2IconUrl(iconUrl.light)}
              alt=""
              width={24}
              height={24}
              className="w-6 h-6 object-contain"
              unoptimized
            />
          ) : iconUrl && typeof iconUrl === 'string' ? (
            <Image
              src={getLucidL2IconUrl(iconUrl)}
              alt=""
              width={24}
              height={24}
              className="w-6 h-6 object-contain"
              unoptimized
            />
          ) : (
            <span className="text-xl" role="img" aria-label="resource icon">
              ⚙️
            </span>
          )}
        </div>
      </div>

      {/* Labels below node */}
      <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 whitespace-nowrap text-center w-28">
        <div className="text-xs font-semibold text-foreground truncate">
          {getMainLabel()}
        </div>
        {getSubLabel() && (
          <div className="text-[10px] text-muted-foreground truncate mt-0.5">
            {getSubLabel()}
          </div>
        )}
      </div>
    </div>
  );
});

ResourceNode.displayName = 'ResourceNode';
