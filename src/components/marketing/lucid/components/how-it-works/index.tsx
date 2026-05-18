"use client";

import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Brain } from "lucide-react";
import { Container } from "../container";
import { PixelatedCanvas } from "../pixelated-canvas";
import { cn } from "@/components/marketing/lucid/lib/utils";
import { SectionHeader } from "../section-header";
import {
  AwakenSkeleton,
  ConnectYourTooklsSkeleton,
  DeployAndScaleSkeleton,
  DesignYourWorkflowSkeleton,
} from "./skeletons";

type Tab = {
  title: string;
  description: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  id: string;
  skeleton: React.ReactNode;
};

const TABS: Tab[] = [
  {
    title: "Awaken in one click",
    description: "Bring autonomous agents to life in one click with identity, memory, and a mission.",
    icon: BrainIcon,
    id: "awaken",
    skeleton: <AwakenSkeleton />,
  },
  {
    title: "Equip in one click",
    description: "Equip them in one click with the tools, channels, and payment rails they need to act.",
    icon: AccessIcon,
    id: "equip",
    skeleton: <ConnectYourTooklsSkeleton />,
  },
  {
    title: "Operate autonomously",
    description: "Let specialists coordinate as one team around a shared mission — even while you sleep.",
    icon: LaunchIcon,
    id: "deploy",
    skeleton: <DesignYourWorkflowSkeleton />,
  },
  {
    title: "Govern with proof",
    description: "Approve, trace, and verify every action with guardrails, proofs, and receipts.",
    icon: ShieldIcon,
    id: "govern",
    skeleton: <DeployAndScaleSkeleton />,
  },
];

export const HowItWorks = () => {
  const [activeTab, setActiveTab] = useState<Tab>(TABS[0]);
  const DURATION = 8000;

  useEffect(() => {
    const interval = setInterval(() => {
      const currentIndex = TABS.findIndex((tab) => tab.id === activeTab.id);
      const nextIndex = (currentIndex + 1) % TABS.length;
      setActiveTab(TABS[nextIndex]);
    }, DURATION);

    return () => clearInterval(interval);
  }, [activeTab]);

  return (
    <Container className="border-divide border-x">
      <div className="flex flex-col items-center pt-16">
        <SectionHeader
          badge="How it works"
          title="Build AI teams that work for you"
          description="Awaken autonomous agents in one click, equip them with access, let them operate as one team, and govern every action with proofs and receipts."
          descriptionOpacity="muted"
          descriptionClassName="max-w-2xl"
        />

        <div className="border-divide divide-divide mt-16 hidden w-full grid-cols-2 divide-x border-t lg:grid">
          <div className="divide-divide divide-y">
            {TABS.map((tab) => (
              <button
                key={tab.title}
                className="group relative flex w-full flex-col items-start overflow-hidden px-10 py-6 text-left hover:bg-gray-100 dark:hover:bg-neutral-800"
                onClick={() => setActiveTab(tab)}
              >
                {tab.id === activeTab.id && <Canvas activeTab={tab} duration={2500} />}
                {tab.id === activeTab.id && <Loader duration={DURATION} />}
                <div
                  className={cn(
                    "text-charcoal-700 relative z-20 flex items-center gap-2 font-medium dark:text-neutral-100",
                    activeTab.id !== tab.id && "group-hover:text-brand",
                  )}
                >
                  <tab.icon className="shrink-0" /> {tab.title}
                </div>
                <p
                  className={cn(
                    "relative z-20 mt-2 max-w-sm text-sm text-gray-600 opacity-[0.55] dark:text-neutral-300",
                    activeTab.id === tab.id && "text-charcoal-700 opacity-[0.55]",
                  )}
                >
                  {tab.description}
                </p>
              </button>
            ))}
          </div>
          <div className="relative h-full min-h-[430px] overflow-hidden bg-[radial-gradient(var(--color-dots)_1px,transparent_1px)] mask-r-from-90% mask-l-from-90% mask-radial-from-20% [background-size:10px_10px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab.id}
                className="absolute inset-0"
                initial={{ filter: "blur(10px)", opacity: 0 }}
                animate={{ filter: "blur(0px)", opacity: 1 }}
                exit={{ filter: "blur(10px)", opacity: 0 }}
                transition={{ duration: 0.45 }}
              >
                {activeTab.skeleton}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="divide-divide border-divide mt-16 flex w-full flex-col divide-y overflow-hidden border-t lg:hidden">
          {TABS.map((tab) => (
            <div
              key={tab.title + "mobile"}
              className="group relative flex w-full flex-col items-start overflow-hidden px-4 py-4 md:px-12 md:py-8"
            >
              <div className="text-charcoal-700 relative z-20 flex items-center gap-2 font-medium dark:text-neutral-100">
                <tab.icon className="shrink-0" /> {tab.title}
              </div>
              <p className="relative z-20 mt-2 text-left text-sm text-gray-600 opacity-[0.55] dark:text-neutral-300">
                {tab.description}
              </p>
              <div className="relative mx-auto h-80 w-full overflow-hidden mask-t-from-90% mask-r-from-90% mask-b-from-90% mask-l-from-90% sm:h-80 sm:w-160">
                {tab.skeleton}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Container>
  );
};

const Loader = ({ duration = 2500 }: { duration?: number }) => {
  return (
    <motion.div
      className="bg-brand absolute inset-x-0 bottom-0 z-30 h-0.5 w-full rounded-full"
      initial={{ width: 0 }}
      animate={{ width: "100%" }}
      transition={{ duration: duration / 1000 }}
    />
  );
};

const Canvas = ({
  activeTab,
  duration,
}: {
  activeTab: Tab;
  duration: number;
}) => {
  return (
    <>
      <div className="absolute inset-x-0 z-20 h-full w-full bg-white mask-t-from-50% dark:bg-neutral-900" />
      <PixelatedCanvas
        key={activeTab.id}
        isActive={true}
        fillColor="var(--color-canvas)"
        backgroundColor="var(--color-canvas-fill)"
        size={2.5}
        duration={duration}
        className="absolute inset-0 scale-[1.01] opacity-20"
      />
    </>
  );
};

function SparkIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="17" viewBox="0 0 16 17" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M8 2.5L9.58333 6.91667L14 8.5L9.58333 10.0833L8 14.5L6.41667 10.0833L2 8.5L6.41667 6.91667L8 2.5Z" stroke="currentColor" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BrainIcon(props: React.SVGProps<SVGSVGElement>) {
  return <Brain size={16} strokeWidth={1.75} {...props} />;
}

function AccessIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="17" viewBox="0 0 16 17" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="3" cy="4" r="1.33333" stroke="currentColor" strokeWidth="1.33333" />
      <circle cx="13" cy="4" r="1.33333" stroke="currentColor" strokeWidth="1.33333" />
      <circle cx="3" cy="13" r="1.33333" stroke="currentColor" strokeWidth="1.33333" />
      <circle cx="13" cy="13" r="1.33333" stroke="currentColor" strokeWidth="1.33333" />
      <circle cx="8" cy="8.5" r="1.33333" stroke="currentColor" strokeWidth="1.33333" />
      <path d="M4.2 4.8L6.9 7.7M11.8 4.8L9.1 7.7M4.2 12.2L6.9 9.3M11.8 12.2L9.1 9.3" stroke="currentColor" strokeWidth="1.33333" strokeLinecap="round" />
    </svg>
  );
}

function LaunchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="17" viewBox="0 0 16 17" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="2" y="3.16667" width="12" height="10.6667" rx="2" stroke="currentColor" strokeWidth="1.33333" />
      <path d="M5 8.5H11M8.5 5L12 8.5L8.5 12" stroke="currentColor" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShieldIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="17" viewBox="0 0 16 17" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M8 2.5L12.6667 4.5V7.5C12.6667 10.4455 10.6933 13.1118 8 13.8333C5.30667 13.1118 3.33333 10.4455 3.33333 7.5V4.5L8 2.5Z" stroke="currentColor" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.33337 8.5L7.33337 9.5L9.83337 7" stroke="currentColor" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
