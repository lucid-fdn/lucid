"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import type { AIAgent } from "@/constants/agents";
import { ShineBorder } from "@/ui/components/shine-border";

export default function AgentCard({ agent }: { agent: AIAgent }) {
  const CardContent = (
    <div className="bg-card rounded-md p-4 shadow hover:shadow-lg transition-shadow duration-200">
      <div className="flex items-center mb-2">
        {agent.image && (
          <Image
            src={agent.image}
            alt={agent.name}
            width={64}
            height={64}
            className="rounded-full mr-3"
          />
        )}
        <div>
          <h2 className="text-lg font-semibold text-foreground">{agent.name}</h2>
          <p className="text-sm text-muted-foreground">{agent.role}</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-3">{agent.description}</p>
      <div className="flex items-center justify-between text-sm">
        {agent.rating && (
          <span className="text-yellow-500">★ {agent.rating.toFixed(1)}</span>
        )}
        {agent.blockchain && (
          <span className="text-muted-foreground">{agent.blockchain}</span>
        )}
      </div>
      <Link
        href={`/agents/${agent.id}`}
        className="mt-3 inline-block px-3 py-1 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors duration-120"
      >
        View
      </Link>
    </div>
  );
  
  // Wrap featured agents with shine border
  if ((agent as unknown as Record<string, unknown>).featured || (agent as unknown as Record<string, string>).tier === 'premium') {
    return (
      <ShineBorder
        className="rounded-lg"
        shineColor={["#0B84F3", "#8B5CF6", "#EC4899"]}
        borderWidth={2}
        duration={8}
      >
        {CardContent}
      </ShineBorder>
    );
  }
  
  return CardContent;
}
