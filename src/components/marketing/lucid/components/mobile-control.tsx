"use client";

import React, { useEffect, useState } from "react";
import { Check, Pause, Shield, ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { Container } from "./container";
import { SectionHeader } from "./section-header";
import { cn } from "@/components/marketing/lucid/lib/utils";
import { LogoIcon } from "@/components/ui/logo-icon";

const channels = [
  { label: "WhatsApp", slug: "whatsapp" },
  { label: "Telegram", slug: "telegram" },
  { label: "Slack", slug: "slack" },
];

const activity = [
  {
    agent: "Lead Agent",
    text: "Revenue Recovery Team found 14 churn-risk accounts and prepared the next send.",
  },
  {
    agent: "Finance Agent",
    text: "3 accounts exceed policy. Approval required before discounts are released.",
  },
  {
    agent: "Support Agent",
    text: "2 at-risk customers replied. Suggested next actions are ready to review.",
  },
];

const quickStats = [
  {
    label: "Live channels",
    value: "3",
    detail: "WhatsApp, Telegram, Slack",
  },
  {
    label: "Pending approvals",
    value: "1",
    detail: "Sequence held above 20% discount",
  },
  {
    label: "Active agents",
    value: "4",
    detail: "Lead, finance, support, escalation",
  },
];

const mobileMoments = [
  "Approve sensitive actions before they go live.",
  "Pause risky behavior the second context changes.",
  "Redirect tasks without opening the full dashboard.",
];

export function MobileControl() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((current) => (current + 1) % activity.length);
    }, 2800);

    return () => clearInterval(interval);
  }, []);

  return (
    <Container className="border-divide border-x">
      <div className="py-16">
        <SectionHeader
          badge="Mobile control"
          title="Run your AI team from your phone"
          description="Approve, pause, and redirect agent work from the same device you already use to stay on top of the business."
          descriptionClassName="max-w-2xl px-4"
        />

        <div className="mt-14 grid grid-cols-1 gap-10 px-4 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-center">
          <div className="space-y-6 lg:pr-8">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#ff7a1b]">
                Lucid in your pocket
              </p>
              <h3 className="mt-3 max-w-2xl text-3xl font-medium text-foreground sm:text-4xl">
                Stay in control even when your agents are already moving
              </h3>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                Lucid keeps the team autonomous, but never out of reach. Review approvals, see what changed, and redirect work before small issues become expensive ones.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {quickStats.map((item) => (
                <div
                  key={item.label}
                  className="rounded-[1.5rem] border border-black/5 bg-white/90 px-4 py-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur dark:border-white/10 dark:bg-neutral-900"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {item.label}
                  </p>
                  <p className="mt-2 text-2xl font-medium text-foreground">{item.value}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-aceternity dark:border-white/10 dark:bg-neutral-900">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">What mobile control is for</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Not for building agents. For keeping live teams aligned once they are already running.
                    </p>
                  </div>
                  <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-300">
                    Live
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <ControlPill
                    icon={<Check className="h-4 w-4" />}
                    title="Approve"
                    text="Release actions without opening the full dashboard."
                  />
                  <ControlPill
                    icon={<Pause className="h-4 w-4" />}
                    title="Pause"
                    text="Stop risky work before it spills into production."
                  />
                  <ControlPill
                    icon={<ArrowRight className="h-4 w-4" />}
                    title="Redirect"
                    text="Push the task to another specialist when context changes."
                  />
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-black/5 bg-[linear-gradient(180deg,rgba(255,122,27,0.08),rgba(255,255,255,0.92))] p-5 shadow-[0_18px_45px_rgba(255,122,27,0.12)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(255,122,27,0.14),rgba(10,10,10,0.92))]">
                <div>
                  <p className="text-sm font-medium text-foreground">When this matters most</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    The phone flow is strongest when an agent is already executing and a human needs to intervene fast.
                  </p>
                </div>

                <div className="mt-5 space-y-3">
                  {mobileMoments.map((moment) => (
                    <div
                      key={moment}
                      className="flex items-start gap-3 rounded-2xl border border-black/5 bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-black/20"
                    >
                      <div className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#ff7a1b] text-white">
                        <Check className="h-3.5 w-3.5" />
                      </div>
                      <p className="text-sm leading-6 text-foreground">{moment}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <PhoneMock activeIndex={activeIndex} />
        </div>
      </div>
    </Container>
  );
}

function PhoneMock({ activeIndex }: { activeIndex: number }) {
  const active = activity[activeIndex];

  return (
    <div className="mx-auto w-full max-w-[390px]">
      <div className="relative rounded-[2.75rem] border border-white/10 bg-neutral-950 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <div className="pointer-events-none absolute -left-10 top-16 h-36 w-36 rounded-full bg-[#ff7a1b]/18 blur-3xl" />
        <div className="pointer-events-none absolute -right-8 bottom-10 h-32 w-32 rounded-full bg-[#2b7cff]/18 blur-3xl" />
        <div className="mx-auto mb-3 h-1.5 w-24 rounded-full bg-white/10" />
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,#101014_0%,#18181f_100%)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,121,27,0.16),transparent_35%)]" />

          <div className="relative z-10 border-b border-white/10 px-4 pb-3 pt-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">Revenue Recovery Team</p>
                <p className="mt-1 text-xs text-white/45">Remote approvals and live team state</p>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-medium text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                Live
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <MiniMetric label="Watching" value="14" />
              <MiniMetric label="Held" value="3" />
              <MiniMetric label="Escalated" value="1" />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {channels.map((channel, index) => (
                <div
                  key={channel.label}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                    index === 0
                      ? "border-white/15 bg-white/10 text-white"
                      : "border-white/8 bg-white/5 text-white/55",
                  )}
                >
                  <LogoIcon slug={channel.slug} size={14} className="text-white" />
                  {channel.label}
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 space-y-3 px-4 py-4">
            <motion.div
              key={active.agent}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="rounded-2xl rounded-tl-md bg-white/8 px-3 py-3 text-white"
            >
              <p className="text-xs font-medium text-white/70">{active.agent}</p>
              <p className="mt-1.5 text-sm leading-6">{active.text}</p>
            </motion.div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3 text-white">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/45">
                    Current guardrail
                  </p>
                  <p className="mt-1 text-sm text-white">
                    Discounts over 20% require explicit approval.
                  </p>
                </div>
                <div className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-medium text-white/75">
                  Policy on
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <div className="max-w-[82%] rounded-2xl rounded-tr-md bg-[#2b7cff] px-3 py-3 text-white">
                <p className="text-xs font-medium text-white/80">You</p>
                <p className="mt-1.5 text-sm leading-6">
                  Hold any discounts above 20% and show me the final approved list.
                </p>
              </div>
            </div>

            <motion.div
              animate={{ scale: [1, 1.01, 1] }}
              transition={{ duration: 2.4, repeat: Infinity }}
              className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">Approval needed</p>
                  <p className="mt-1 text-xs leading-5 text-white/55">
                    Launch the recovery sequence to 11 approved accounts now.
                  </p>
                </div>
                <Shield className="mt-0.5 h-4 w-4 text-amber-300" />
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <PhoneAction label="Approve" tone="primary" icon={<Check className="h-3.5 w-3.5" />} />
                <PhoneAction label="Redirect" icon={<ArrowRight className="h-3.5 w-3.5" />} />
                <PhoneAction label="Pause" icon={<Pause className="h-3.5 w-3.5" />} />
              </div>
            </motion.div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/45">
                Next queued step
              </p>
              <p className="mt-2 text-sm leading-6 text-white">
                Finance Agent will release the approved accounts and keep the remaining 3 in review.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/45">{label}</p>
      <p className="mt-1 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function PhoneAction({
  label,
  icon,
  tone = "secondary",
}: {
  label: string;
  icon: React.ReactNode;
  tone?: "primary" | "secondary";
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[11px] font-medium transition",
        tone === "primary"
          ? "bg-white text-black"
          : "border border-white/10 bg-white/8 text-white",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ControlPill({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-black/5 bg-neutral-50 p-4 dark:border-white/10 dark:bg-neutral-950">
      <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white text-foreground shadow-sm dark:bg-neutral-900">
        {icon}
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
