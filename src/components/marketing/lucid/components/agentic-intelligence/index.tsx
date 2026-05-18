"use client";
import React from "react";
import { Container } from "../container";
import { SectionHeader } from "../section-header";
import { Card, CardDescription, CardMeta, CardTitle } from "./card";
import {
  BrainIcon,
  FingerprintIcon,
  MouseBoxIcon,
  NativeIcon,
  RealtimeSyncIcon,
  SDKIcon,
} from "@/components/marketing/lucid/icons/bento-icons";
import {
  LLMModelSelectorSkeleton,
  NativeToolsIntegrationSkeleton,
  TextToWorkflowBuilderSkeleton,
} from "./skeletons";

export const AgenticIntelligence = () => {
  return (
    <Container className="border-divide border-x">
      <div className="flex flex-col items-center py-16">
        <SectionHeader
          badge="Features"
          title="Everything your agents need to operate"
          description="Give agents the ability to act, remember, and keep working with the control to trust them in the real world."
          descriptionOpacity="muted"
          descriptionClassName="max-w-lg px-2"
        />
        <div className="border-divide divide-divide mt-16 grid grid-cols-1 divide-y border-y md:grid-cols-2 md:divide-x">
          <Card className="overflow-hidden mask-b-from-80%">
            <div className="flex items-center gap-2">
              <BrainIcon />
              <CardTitle>Identity and memory built in</CardTitle>
            </div>
            <CardDescription>
              Give every agent a role, continuity, and context that persists
              across work instead of starting from scratch every time.
            </CardDescription>
            <LLMModelSelectorSkeleton />
          </Card>
          <Card className="overflow-hidden mask-b-from-80%">
            <div className="flex items-center gap-2">
              <MouseBoxIcon />
              <CardTitle>Agents that act, not just respond</CardTitle>
            </div>
            <CardDescription>
              Give agents identity, persistent memory, tools, APIs, and skills
              so they can take action, not just generate text.
            </CardDescription>
            <CardMeta>MCP + Skills</CardMeta>
            <TextToWorkflowBuilderSkeleton />
          </Card>
        </div>
        <div className="w-full">
          <Card className="relative w-full max-w-none overflow-hidden">
            <div className="pointer-events-none absolute inset-0 h-full w-full bg-[radial-gradient(var(--color-dots)_1px,transparent_1px)] mask-radial-from-10% [background-size:10px_10px]"></div>
            <div className="flex items-center gap-2">
              <NativeIcon />
              <CardTitle>Operate autonomous systems with control</CardTitle>
            </div>
            <CardDescription>
              Run long-lived agent systems with the integrations, visibility,
              guardrails, and receipts needed to trust them in production.
            </CardDescription>
            <NativeToolsIntegrationSkeleton />
          </Card>
        </div>
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
          <Card>
            <div className="flex items-center gap-2">
              <FingerprintIcon />
              <CardTitle>All models. One system.</CardTitle>
            </div>
            <CardDescription>
              Route frontier and open-source models from one control layer
              without rebuilding your stack around a single provider.
            </CardDescription>
            <CardMeta>Lucid Inference</CardMeta>
          </Card>
          <Card>
            <div className="flex items-center gap-2">
              <RealtimeSyncIcon />
              <CardTitle>Keep agent jobs moving instantly</CardTitle>
            </div>
            <CardDescription>
              Send work forward without bottlenecks, stalls, or broken handoffs
              when agents run for real.
            </CardDescription>
            <CardMeta>Pulse</CardMeta>
          </Card>
          <Card>
            <div className="flex items-center gap-2">
              <SDKIcon />
              <CardTitle>Agents that work as one system</CardTitle>
            </div>
            <CardDescription>
              Turn tasks into coordinated team execution instead of isolated bot
              behavior.
            </CardDescription>
            <CardMeta>Nerve</CardMeta>
          </Card>
        </div>
      </div>
    </Container>
  );
};
