"use client";
import React, { useState } from "react";
import { Container } from "./container";
import { SectionHeader } from "./section-header";
import { Scale } from "./scale";
import { motion } from "motion/react";
import Image from "next/image";
import { LogoIcon } from "@/components/ui/logo-icon";
import { ModelIcon } from "@/components/icons/model-icon";
import { Avatar, AvatarFallback, AvatarGroup } from "@/components/ui/avatar";
import { cn } from "@/components/marketing/lucid/lib/utils";

type StackItem =
  | { id: string; kind: "slug"; slug: string; label: string }
  | { id: string; kind: "model"; provider: string; label: string }
  | { id: string; kind: "local"; src: string; label: string; className?: string };

export const UseCases = () => {
  const useCases: { title: string; description: string; stack: StackItem[] }[] = [
    {
      title: "Sales Team",
      description:
        "Qualify leads, enrich accounts, draft outreach, and keep pipeline work moving without manual handoffs.",
      stack: [
        { id: "sales-hubspot", kind: "slug", slug: "hubspot", label: "HubSpot" },
        { id: "sales-lemlist", kind: "slug", slug: "lemlist", label: "Lemlist" },
        {
          id: "sales-linkedin",
          kind: "local",
          src: "/logos/linkedin.svg",
          label: "LinkedIn",
          className: "h-9 w-9",
        },
      ],
    },
    {
      title: "Marketing Team",
      description:
        "Plan campaigns, coordinate launches, generate assets, and keep execution aligned across channels.",
      stack: [
        { id: "marketing-canva", kind: "slug", slug: "canva", label: "Canva" },
        { id: "marketing-notion", kind: "slug", slug: "notion", label: "Notion" },
        { id: "marketing-slack", kind: "slug", slug: "slack", label: "Slack" },
      ],
    },
    {
      title: "Content Team",
      description:
        "Research topics, draft content, review outputs, and publish across the systems your team already uses.",
      stack: [
        { id: "content-openai", kind: "model", provider: "openai", label: "OpenAI" },
        { id: "content-notion", kind: "slug", slug: "notion", label: "Notion" },
        { id: "content-drive", kind: "slug", slug: "google-drive", label: "Google Drive" },
      ],
    },
    {
      title: "Support Team",
      description:
        "Resolve escalations across inboxes, docs, tickets, and customer channels with governed handoffs.",
      stack: [
        { id: "support-whatsapp", kind: "slug", slug: "whatsapp", label: "WhatsApp" },
        { id: "support-linear", kind: "slug", slug: "linear", label: "Linear" },
        { id: "support-notion", kind: "slug", slug: "notion", label: "Notion" },
      ],
    },
    {
      title: "Operations Team",
      description:
        "Coordinate recurring workflows, exceptions, approvals, and internal follow-through without dropping context.",
      stack: [
        { id: "ops-slack", kind: "slug", slug: "slack", label: "Slack" },
        { id: "ops-asana", kind: "slug", slug: "asana", label: "Asana" },
        { id: "ops-calendar", kind: "slug", slug: "google-calendar", label: "Google Calendar" },
      ],
    },
    {
      title: "Finance Team",
      description:
        "Reconcile receipts, track spend, flag anomalies, and keep financial actions auditable from end to end.",
      stack: [
        { id: "finance-stripe", kind: "slug", slug: "stripe", label: "Stripe" },
        { id: "finance-notion", kind: "slug", slug: "notion", label: "Notion" },
        { id: "finance-solana", kind: "slug", slug: "solana", label: "Solana" },
      ],
    },
  ];
  const [activeUseCase, setActiveUseCase] = useState<number | null>(null);
  return (
    <Container className="border-divide relative overflow-hidden border-x px-4 md:px-8">
      <div className="relative flex flex-col items-center py-20">
        <SectionHeader
          badge="Templates"
          title="One-click templates for the teams every business runs"
          description="Start with pre-configured AI teams you can deploy, adapt, and run from one control plane."
          descriptionClassName="max-w-lg"
        />

        <div className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3">
          {useCases.map((useCase, index) => (
            <div
              onMouseEnter={() => setActiveUseCase(index)}
              key={useCase.title}
              className="relative"
            >
              {activeUseCase === index && (
                <motion.div
                  layoutId="scale"
                  className="absolute inset-0 z-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.5 }}
                  exit={{ opacity: 0 }}
                >
                  <Scale />
                </motion.div>
              )}
              <div className="relative z-10 rounded-lg bg-white p-4 transition duration-200 hover:bg-transparent md:p-5 dark:bg-neutral-900">
                <LogoAvatarStack items={useCase.stack} />
                <h3 className="mt-4 mb-2 text-lg font-medium">
                  {useCase.title}
                </h3>
                <p className="text-gray-600 opacity-[0.55] dark:text-neutral-300">
                  {useCase.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Container>
  );
};

function LogoAvatarStack({ items }: { items: StackItem[] }) {
  return (
    <AvatarGroup className="-space-x-2 *:data-[slot=avatar]:ring-white dark:*:data-[slot=avatar]:ring-neutral-900">
      {items.map((item) => (
        <Avatar
          key={item.id}
          className="size-9 bg-neutral-100 shadow-sm dark:bg-neutral-800"
          title={item.label}
        >
          <AvatarFallback className="bg-transparent">
            {item.kind === "local" ? (
              <Image
                src={item.src}
                alt={item.label}
                width={20}
                height={20}
                className={cn("h-5 w-5 object-contain", item.className)}
              />
            ) : item.kind === "model" ? (
              <ModelIcon provider={item.provider} size={20} />
            ) : (
              <LogoIcon slug={item.slug} size={20} />
            )}
          </AvatarFallback>
        </Avatar>
      ))}
    </AvatarGroup>
  );
}
