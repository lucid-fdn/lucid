"use client";
import Image from "next/image";
import {
  AnthropicLogo,
  OpenAILogo,
} from "@/components/marketing/lucid/icons/general";
import { cn } from "@/components/marketing/lucid/lib/utils";
import React, { useEffect, useRef, useState } from "react";
import { DivideX } from "../divide";
import { motion, useMotionValue, useTransform, type MotionValue } from "motion/react";
import { Scale } from "../scale";
import { LogoSVG } from "../logo";
import { IntegrationsLogo } from "@/components/marketing/lucid/icons/bento-icons";
import { DeployingCanvasNode, type DeployingNodeData } from "@/components/assistants/deploying-canvas-node";
import { Card } from "../tech-card";
import { LogoIcon } from "@/components/ui/logo-icon";

const AWAKEN_DEPLOY_DATA: DeployingNodeData = {
  label: "Awakening Lucid Growth Lead",
  phase: "creating",
  l2Status: { status: "running" } as DeployingNodeData["l2Status"],
};

function AwakenDeployNode() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setStep((current) => (current >= 4 ? 0 : current + 1));
    }, step >= 4 ? 1800 : 1400);

    return () => clearTimeout(timer);
  }, [step]);

  const phasedData: DeployingNodeData =
    step === 0
      ? {
          ...AWAKEN_DEPLOY_DATA,
          phase: "deploying",
          l2Status: null,
        }
      : step === 1
        ? {
            ...AWAKEN_DEPLOY_DATA,
            phase: "deploying",
            l2Status: { status: "deploying" } as DeployingNodeData["l2Status"],
          }
        : step === 2
          ? {
              ...AWAKEN_DEPLOY_DATA,
              phase: "deploying",
              l2Status: { status: "running" } as DeployingNodeData["l2Status"],
            }
          : step === 3
            ? {
                ...AWAKEN_DEPLOY_DATA,
                phase: "connecting",
                l2Status: { status: "running" } as DeployingNodeData["l2Status"],
              }
            : {
                ...AWAKEN_DEPLOY_DATA,
                phase: "creating",
                l2Status: { status: "running" } as DeployingNodeData["l2Status"],
              };

  return (
    <DeployingCanvasNode
      {...({
        id: "marketing-awaken-deploy",
        data: phasedData,
        selected: false,
        dragging: false,
        zIndex: 0,
        isConnectable: false,
        xPos: 0,
        yPos: 0,
      } as any)}
    />
  );
}

export const AwakenSkeleton = () => {
  return (
    <div className="mt-8 flex h-full items-center justify-center px-8">
      <div className="relative h-[280px] w-full max-w-[420px]">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <AwakenDeployNode />
        </div>
      </div>
    </div>
  );
};

export const DesignYourWorkflowSkeleton = () => {
  return (
    <div className="mt-12 flex flex-col items-center">
      <div className="relative">
        <Card
          title="Lucid"
          subtitle="Lead"
          logo={
            <Image
              src="/lucid.png"
              alt="Lucid"
              width={16}
              height={16}
              className="h-4 w-4 rounded-sm object-contain"
            />
          }
          cta="Coordinator"
          tone="success"
        />
        <LeftSVG className="absolute top-12 -left-32" />
        <RightSVG className="absolute top-12 -right-32" />
      </div>

      <div className="mt-12 flex flex-row gap-4.5">
        <Card
          title="Hermes"
          subtitle="Research"
          logo={
            <Image
              src="/logos/nous.jpeg"
              alt="Hermes"
              width={16}
              height={16}
              className="h-4 w-4 rounded-sm object-cover"
            />
          }
          cta="Specialist"
          tone="danger"
          delay={0.2}
        />
        <Card
          title="OpenClaw"
          subtitle="Execution"
          logo={
            <Image
              src="/logos/openclaw.svg"
              alt="OpenClaw"
              width={16}
              height={16}
              className="h-4 w-4 rounded-sm object-contain"
            />
          }
          cta="Specialist"
          tone="default"
          delay={0.4}
        />
      </div>
    </div>
  );
};

export const ConnectYourTooklsSkeleton = () => {
  const text = `Recover churn-risk customers across CRM, payments, and messaging.`;
  const [mounted, setMounted] = useState(false);
  const progressWidth = 72;

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="relative flex h-full w-full items-center justify-between">
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="relative h-70 w-60 translate-x-3 rounded-2xl border-t border-gray-300 bg-white p-4 shadow-2xl md:translate-x-0 dark:border-neutral-700 dark:bg-neutral-900"
      >
        <div className="absolute -top-4 -right-4 flex h-14 w-14 items-center justify-center rounded-lg bg-white shadow-xl">
          <Scale />
          <OpenAILogo className="relative z-20 h-8 w-8" />
        </div>
        <div className="mt-12 flex items-center gap-2">
          <IntegrationsLogo />
          <span className="text-charcoal-700 text-sm font-medium dark:text-neutral-200">
            Tasks
          </span>
        </div>
        <DivideX className="mt-2" />

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-charcoal-700 text-[10px] leading-loose font-normal md:text-xs dark:text-neutral-200">
              {text.split(/(\s+)/).map((word, index) => (
                <motion.span
                  key={index}
                  initial={{
                    opacity: 0,
                  }}
                  animate={{
                    opacity: 1,
                  }}
                  transition={{
                    duration: 0.2,
                    delay: index * 0.02,
                    ease: "linear",
                  }}
                  className="inline-block"
                >
                  {word === " " ? "\u00A0" : word}
                </motion.span>
              ))}
            </span>
          </div>
        </div>
        <div className="mt-2 flex flex-col">
          {[...Array(2)].map((_, index) => (
            <motion.div
              key={`width-bar-right-${index}`}
              initial={{
                width: "0%",
              }}
              animate={{
                width: `${progressWidth}%`,
              }}
              transition={{
                duration: 4,
                delay: index * 0.2,
                ease: "easeInOut",
                repeat: Infinity,
                repeatType: "reverse",
              }}
              className="mt-2 h-4 w-full rounded-full bg-gray-200 dark:bg-neutral-800"
            />
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1 }}
        className="absolute inset-x-0 z-30 hidden items-center justify-center md:flex"
      >
        <div className="size-3 rounded-full border-2 border-blue-500 bg-white dark:bg-neutral-800" />
        <div className="h-[2px] w-38 bg-blue-500" />
        <div className="size-3 rounded-full border-2 border-blue-500 bg-white dark:bg-neutral-800" />
      </motion.div>
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 1 }}
        className="relative h-70 w-60 translate-x-10 rounded-2xl border-t border-gray-300 bg-white p-4 shadow-2xl md:translate-x-0 dark:border-neutral-700 dark:bg-neutral-900"
      >
        <div className="absolute -top-4 -left-4 flex h-14 w-14 items-center justify-center rounded-lg bg-white shadow-xl dark:bg-neutral-800">
          <Image
            src="/logos/openclaw.svg"
            alt="OpenClaw"
            width={32}
            height={32}
            className="relative z-20 h-8 w-8 object-contain"
          />
        </div>
        <div className="mt-12 flex items-center gap-2">
          <IntegrationsLogo className="dark:text-neutral-200" />
          <span className="text-charcoal-700 text-xs font-medium md:text-sm dark:text-neutral-200">
            Integrations
          </span>
          <span className="text-charcoal-700 rounded-lg border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200">
            200
          </span>
        </div>
        <DivideX className="mt-2" />
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <LogoIcon slug="hubspot" size={16} className="h-4 w-4 shrink-0 object-contain" />
            <span className="text-charcoal-700 text-xs font-medium md:text-sm dark:text-neutral-200">
              HubSpot
            </span>
          </div>

          <div className="rounded-sm border border-blue-500 bg-blue-50 px-2 py-0.5 text-xs text-blue-500">
            Connected
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <LogoIcon slug="stripe" size={16} className="h-4 w-4 shrink-0 object-contain" />
            <span className="text-charcoal-700 text-xs font-medium md:text-sm dark:text-neutral-200">
              Stripe
            </span>
          </div>

          <div className="rounded-sm border border-blue-500 bg-blue-50 px-2 py-0.5 text-xs text-blue-500">
            Connected
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <LogoIcon slug="gmail" size={16} className="h-4 w-4 shrink-0 object-contain" />
            <span className="text-charcoal-700 text-xs font-medium md:text-sm dark:text-neutral-200">
              Gmail
            </span>
          </div>

          <div className="rounded-sm border border-blue-500 bg-blue-50 px-2 py-0.5 text-xs text-blue-500">
            Connected
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Image
              src="/logos/whatsapp.svg"
              alt="WhatsApp"
              width={16}
              height={16}
              className="h-4 w-4 shrink-0 object-contain"
            />
            <span className="text-charcoal-700 text-xs font-medium md:text-sm dark:text-neutral-200">
              WhatsApp
            </span>
          </div>

          <div className="rounded-sm border border-blue-500 bg-blue-50 px-2 py-0.5 text-xs text-blue-500">
            Connected
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export const DeployAndScaleSkeleton = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  const receiptCards = [
    {
      label: "On-chain receipt",
      detail: "Treasury action settled and provable",
      slug: "solana",
      tone: "violet" as const,
      assetPath: "/logos/icon/solana.svg",
    },
    {
      label: "Payment receipt",
      detail: "Charge captured and invoice reconciled",
      slug: "stripe",
      tone: "blue" as const,
    },
    {
      label: "Execution receipt",
      detail: "Issue updated and workflow advanced",
      slug: "linear",
      tone: "orange" as const,
    },
    {
      label: "Knowledge receipt",
      detail: "Workspace updated with generated output",
      slug: "notion",
      tone: "gray" as const,
    },
    {
      label: "Channel receipt",
      detail: "Outbound reply delivered to customer",
      slug: "whatsapp",
      tone: "emerald" as const,
      assetPath: "/logos/whatsapp.svg",
    },
  ];

  const extendedCards = [...receiptCards, ...receiptCards, ...receiptCards];
  const cardHeight = 64;
  const gap = 16;
  const itemHeight = cardHeight + gap;
  const offset = (containerHeight - itemHeight) / 2;

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height ?? 0;
      setContainerHeight(height);
    });

    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const y = useMotionValue(0);
  const totalHeight = extendedCards.length * itemHeight;

  useEffect(() => {
    let animationFrame: number;
    let lastTime = performance.now();
    const speed = 30;

    function animateScroll(now: number) {
      const elapsed = (now - lastTime) / 1000;
      lastTime = now;
      let current = y.get();
      current -= speed * elapsed;

      if (Math.abs(current) >= totalHeight / 3) current += totalHeight / 3;

      y.set(current);
      animationFrame = requestAnimationFrame(animateScroll);
    }

    animationFrame = requestAnimationFrame(animateScroll);
    return () => cancelAnimationFrame(animationFrame);
  }, [totalHeight, y]);

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      ref={containerRef}
      style={{
        maskImage:
          "linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)",
      }}
    >

      <motion.div
        className="absolute left-1/2 flex w-full -translate-x-1/2 flex-col items-center"
        style={{ y }}
      >
        {extendedCards.map((card, index) => (
          <AnimatedReceiptCard
            key={`${index}-${card.label}`}
            card={card}
            index={index}
            itemHeight={itemHeight}
            offset={offset}
            y={y}
          />
        ))}
      </motion.div>
    </div>
  );
};

function AnimatedReceiptCard({
  card,
  index,
  itemHeight,
  offset,
  y,
}: {
  card: {
    slug: string;
    label: string;
    detail: string;
    tone: "violet" | "blue" | "orange" | "gray" | "emerald";
    assetPath?: string;
  };
  index: number;
  itemHeight: number;
  offset: number;
  y: MotionValue<number>;
}) {
  const inputRange = [
    offset + (index - 2) * -itemHeight,
    offset + (index - 1) * -itemHeight,
    offset + index * -itemHeight,
    offset + (index + 1) * -itemHeight,
    offset + (index + 2) * -itemHeight,
  ];
  const scale = useTransform(y, inputRange, [0.85, 0.95, 1.1, 0.95, 0.85]);
  const opacity = useTransform(y, inputRange, [0.35, 0.75, 1, 0.75, 0.35]);

  return (
    <motion.div
      className="mx-auto mt-4 w-full max-w-sm shrink-0 rounded-2xl shadow-xl"
      style={{ scale, opacity }}
    >
      <ReceiptRow {...card} />
    </motion.div>
  );
}

const ReceiptRow = ({
  slug,
  label,
  detail,
  tone,
  assetPath,
}: {
  slug: string;
  label: string;
  detail: string;
  tone: "violet" | "blue" | "orange" | "gray" | "emerald";
  assetPath?: string;
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3 dark:border-neutral-800 dark:bg-neutral-950"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl border",
            tone === "violet" && "border-violet-500/20 bg-violet-500/10",
            tone === "blue" && "border-blue-500/20 bg-blue-500/10",
            tone === "orange" && "border-orange-500/20 bg-orange-500/10",
            tone === "gray" && "border-neutral-500/20 bg-neutral-500/10",
            tone === "emerald" && "border-emerald-500/20 bg-emerald-500/10",
          )}
        >
          {assetPath ? (
            <Image
              src={assetPath}
              alt={slug}
              width={18}
              height={18}
              className="h-[18px] w-[18px] object-contain"
            />
          ) : (
            <LogoIcon slug={slug} size={18} className="h-[18px] w-[18px] object-contain" />
          )}
        </div>
        <span className="text-charcoal-700 text-sm font-semibold leading-tight dark:text-neutral-100">
          {label}
        </span>
      </div>
      <div className="ml-3 flex max-w-[46%] items-center gap-2">
        <span className="text-charcoal-700 text-right text-[11px] leading-4 font-normal text-neutral-500 dark:text-neutral-400">
          {detail}
        </span>
        <div className="size-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.7)]" />
      </div>
    </motion.div>
  );
};

const LeftSVG = (props: React.SVGProps<SVGSVGElement>) => {
  return (
    <motion.svg
      width="128"
      height="97"
      viewBox="0 0 128 97"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      initial={{
        opacity: 0,
      }}
      animate={{
        opacity: 1,
      }}
      transition={{
        duration: 1,
      }}
      className={props.className}
    >
      <mask id="path-1-inside-1_557_1106" fill="var(--color-line)">
        <path d="M127.457 0.0891113L127.576 95.9138L0.939007 96.0718L0.839368 16.2472C0.828338 7.41063 7.98283 0.238242 16.8194 0.227212L127.457 0.0891113Z" />
      </mask>
      <path
        d="M127.457 0.0891113L127.576 95.9138L127.457 0.0891113ZM-0.0609919 96.0731L-0.160632 16.2484C-0.172351 6.85959 7.4293 -0.761068 16.8181 -0.772787L16.8206 1.22721C8.53637 1.23755 1.82903 7.96166 1.83937 16.2459L1.93901 96.0706L-0.0609919 96.0731ZM-0.160632 16.2484C-0.172351 6.85959 7.4293 -0.761068 16.8181 -0.772787L127.455 -0.910888L127.458 1.08911L16.8206 1.22721C8.53637 1.23755 1.82903 7.96166 1.83937 16.2459L-0.160632 16.2484ZM127.576 95.9138L0.939007 96.0718L127.576 95.9138Z"
        fill="#EAEDF1"
        mask="url(#path-1-inside-1_557_1106)"
      />
      <path
        d="M127.457 0.0891113L127.576 95.9138L127.457 0.0891113ZM-0.0609919 96.0731L-0.160632 16.2484C-0.172351 6.85959 7.4293 -0.761068 16.8181 -0.772787L16.8206 1.22721C8.53637 1.23755 1.82903 7.96166 1.83937 16.2459L1.93901 96.0706L-0.0609919 96.0731ZM-0.160632 16.2484C-0.172351 6.85959 7.4293 -0.761068 16.8181 -0.772787L127.455 -0.910888L127.458 1.08911L16.8206 1.22721C8.53637 1.23755 1.82903 7.96166 1.83937 16.2459L-0.160632 16.2484ZM127.576 95.9138L0.939007 96.0718L127.576 95.9138Z"
        fill="url(#gradient-one)"
        mask="url(#path-1-inside-1_557_1106)"
      />
      <defs>
        <motion.linearGradient
          id="gradient-one"
          initial={{
            x1: "100%",
            x2: "90%",
            y1: "90%",
            y2: "80%",
          }}
          animate={{
            x1: "20%",
            x2: "0%",
            y1: "90%",
            y2: "220%",
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            repeatDelay: 2,
          }}
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--color-line)" stopOpacity="0.5" offset="0" />
          <stop stopColor="#5787FF" stopOpacity="1" offset="0.5" />
          <stop stopColor="var(--color-line)" stopOpacity="0" offset="1" />
        </motion.linearGradient>
      </defs>
    </motion.svg>
  );
};

const RightSVG = (props: React.SVGProps<SVGSVGElement>) => {
  return (
    <motion.svg
      width="128"
      height="96"
      viewBox="0 0 128 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
      className={props.className}
    >
      <mask id="path-1-inside-1_right" fill="var(--color-line)">
        <path d="M0.619629 0L0.500018 95.8247L127.137 95.9827L127.237 16.1581C127.248 7.32151 120.094 0.149131 111.257 0.138101L0.619629 0Z" />
      </mask>
      <path
        d="M0.619629 0L0.500018 95.8247L0.619629 0ZM128.137 95.984L128.237 16.1593C128.249 6.77047 120.647 -0.850179 111.258 -0.861898L111.256 1.1381C119.54 1.14844 126.247 7.87255 126.237 16.1568L126.137 95.9815L128.137 95.984ZM128.237 16.1593C128.249 6.77047 120.647 -0.850179 111.258 -0.861898L0.620877 -0.999999L0.618381 0.999999L111.256 1.1381C119.54 1.14844 126.247 7.87255 126.237 16.1568L128.237 16.1593ZM0.500018 95.8247L127.137 95.9827L0.500018 95.8247Z"
        fill="#EAEDF1"
        mask="url(#path-1-inside-1_right)"
      />
    </motion.svg>
  );
};

const CenterSVG = (props: React.SVGProps<SVGSVGElement>) => {
  return (
    <motion.svg
      width="2"
      height="54"
      viewBox="0 0 2 54"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
      className={props.className}
    >
      <rect width="2" height="54" rx="1" fill="url(#center-gradient)" />
      <defs>
        <linearGradient id="center-gradient" x1="1" y1="0" x2="1" y2="54" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EAEDF1" />
          <stop offset="0.5" stopColor="#5787FF" />
          <stop offset="1" stopColor="#EAEDF1" />
        </linearGradient>
      </defs>
    </motion.svg>
  );
};
