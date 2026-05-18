import React from 'react';
import Image from 'next/image';
import { useAgents } from '@/hooks/useAgents';
import { getAgentUIConfig } from '@/constants/agents';

interface AgentMenuProps {
  onClose: () => void;
  onSelect: (agentId: string) => void;
}

export default function AgentMenu({ onClose, onSelect }: AgentMenuProps) {
  const { agents, isLoading, error } = useAgents();

  if (isLoading) {
    return (
      <div className="absolute bottom-full left-0 mb-2 w-64 bg-popover text-popover-foreground rounded-lg shadow-lg p-4">
        <div className="text-sm">Loading agents...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="absolute bottom-full left-0 mb-2 w-64 bg-popover text-popover-foreground rounded-lg shadow-lg p-4">
        <div className="text-red-400 text-sm">
          {error instanceof Error ? error.message : 'Failed to load agents'}
        </div>
      </div>
    );
  }

  return (
    <div className="absolute bottom-full left-0 mb-2 w-64 bg-popover text-popover-foreground rounded-lg shadow-lg overflow-hidden">
      <div className="max-h-96 overflow-y-auto">
        {agents.map((agent) => {
          const _uiConfig = getAgentUIConfig(agent.id);
          return (
            <button
              key={agent.id}
              onClick={() => {
                onSelect(agent.id);
                onClose();
              }}
              className="w-full flex items-center p-3 hover:bg-accent hover:text-accent-foreground transition-colors duration-120"
            >
              <div className="relative w-10 h-10 rounded-full overflow-hidden">
                <Image
                  src={agent.image || '/agents/default.jpg'}
                  alt={agent.name}
                  fill
                  className="object-cover"
                />
              </div>
              <span className="ml-3 text-sm">{agent.name}</span>
            </button>
          );
        })}
      </div>
      <div className="p-3 border-t border-border">
        <button
          onClick={onClose}
          className="w-full py-2 px-4 bg-secondary text-secondary-foreground hover:bg-secondary/80 text-sm rounded transition-colors duration-120"
        >
          Create Agent (Coming Soon)
        </button>
      </div>
    </div>
  );
}
