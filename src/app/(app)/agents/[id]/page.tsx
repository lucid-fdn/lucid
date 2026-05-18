// app/agents/[id]/page.tsx
"use client";
// Changed to nodejs for Vercel size limits
export const runtime = "nodejs";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getAgentById, type AIAgent } from "@/constants/agents";
import Image from "next/image";
import Link from "next/link";

export default function AgentDetailsPage() {
  const params = useParams();

  // Safely handle the case where params.id could be string[] or string
  const agentId = params && (Array.isArray(params.id) ? params.id[0] : params.id);
  const [agent, setAgent] = useState<AIAgent | null>(null);

  useEffect(() => {
    if (agentId) {
      const agentData = getAgentById(agentId);
      if (agentData) setAgent(agentData);
    }
  }, [agentId]);

  if (!agent) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-gray-500">Loading agent...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Link href="/agents" className="text-blue-600 hover:underline">
        ← Back to Marketplace
      </Link>
      <div className="mt-4 flex flex-col md:flex-row gap-6">
        {agent.image && (
          <div className="flex-shrink-0">
            <Image
              src={agent.image}
              alt={agent.name}
              width={200}
              height={200}
              className="rounded-xl object-cover"
            />
          </div>
        )}
        <div>
          <h1 className="text-3xl font-bold mb-2">{agent.name}</h1>
          <p className="text-gray-500 mb-4">{agent.role}</p>
          {agent.rating && (
            <div className="text-yellow-500 mb-4">★ {agent.rating.toFixed(1)}</div>
          )}
          {agent.blockchain && (
            <div className="text-sm text-gray-400 mb-2">
              On {agent.blockchain} chain
            </div>
          )}
          {agent.lore && (
            <p className="text-sm text-muted-foreground mb-4">{agent.lore}</p>
          )}
          <div className="flex items-center gap-3 mt-4">
            <button className="px-4 py-2 border border-border rounded hover:bg-accent">
              + Favorite
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
