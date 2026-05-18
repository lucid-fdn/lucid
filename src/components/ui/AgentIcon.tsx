import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { ArrowsRightLeftIcon } from '@heroicons/react/24/outline';
import { useAgent } from '@/hooks/useAgent';
import AgentMenu from './AgentMenu';

interface AgentIconProps {
  agentId?: string;
  onAgentChange?: (newAgentId: string) => void;
}

export default function AgentIcon({ agentId, onAgentChange }: AgentIconProps) {
  const [showMenu, setShowMenu] = useState(false);
  const { agent, isLoading } = useAgent(agentId);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (isLoading) {
    return (
      <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="relative w-8 h-8 rounded-full overflow-hidden group"
      >
        <Image
          src={agent.image}
          alt={agent.name}
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-opacity-0 group-hover:bg-opacity-40 transition-opacity flex items-center justify-center">
          <ArrowsRightLeftIcon className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </button>

      {showMenu && (
        <AgentMenu 
          onClose={() => setShowMenu(false)} 
          onSelect={(newAgentId) => {
            onAgentChange?.(newAgentId);
            setShowMenu(false);
          }}
        />
      )}
    </div>
  );
} 