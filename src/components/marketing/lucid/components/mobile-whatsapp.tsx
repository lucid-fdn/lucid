"use client";

import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Container } from "./container";
import { SectionHeader } from "./section-header";
import { LogoIcon } from "@/components/ui/logo-icon";
import {
  CHANNEL_METADATA,
  type ChannelType,
} from "@/lib/channels/types";

type ChannelKey = ChannelType | "teams";

const channels: Array<{
  key: ChannelKey;
  label: string;
  logoSlug: string;
  screenSrc?: string;
  availabilityLabel?: string;
}> = [
  {
    key: "whatsapp",
    label: CHANNEL_METADATA.whatsapp.name,
    logoSlug: "whatsapp",
    screenSrc: "/images/whatsapp-chat-ui.png",
  },
  {
    key: "telegram",
    label: CHANNEL_METADATA.telegram.name,
    logoSlug: "telegram",
    screenSrc: "/images/telegram-mock.png",
  },
  {
    key: "imessage",
    label: CHANNEL_METADATA.imessage.name,
    logoSlug: "imessage",
  },
  {
    key: "slack",
    label: CHANNEL_METADATA.slack.name,
    logoSlug: "slack",
  },
  {
    key: "discord",
    label: CHANNEL_METADATA.discord.name,
    logoSlug: "discord",
  },
  {
    key: "teams",
    label: "Teams",
    logoSlug: "msteams",
  },
];

export function MobileWhatsapp() {
  const [activeChannel, setActiveChannel] = useState<ChannelKey>("whatsapp");
  const active = channels.find((channel) => channel.key === activeChannel) ?? channels[0];
  const activeIndex = channels.findIndex((channel) => channel.key === activeChannel);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveChannel((current) => {
        const currentIndex = channels.findIndex((channel) => channel.key === current);
        const nextIndex = (currentIndex + 1) % channels.length;
        return channels[nextIndex]?.key ?? "whatsapp";
      });
    }, 3200);

    return () => clearInterval(timer);
  }, []);

  return (
    <Container className="border-divide border-x">
      <div className="px-4 py-16">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
          <SectionHeader
            badge="Mobile and Desktop"
            align="left"
            className="lg:pl-10"
            title={
              <span className="flex flex-wrap items-center gap-2 text-balance">
                <span>Chat with your AI team in</span>
                <AnimatePresence mode="wait">
                    <motion.button
                      key={`active-title-${active.key}`}
                      type="button"
                    onClick={() => {
                      const nextIndex = (activeIndex + 1) % channels.length;
                      setActiveChannel(channels[nextIndex]?.key ?? "whatsapp");
                    }}
                    className="inline-flex items-center gap-2.5 align-middle text-inherit"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                      <span className="text-inherit">{active.label}</span>
                      {active.availabilityLabel ? (
                        <span className="rounded-full border border-zinc-300/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                          {active.availabilityLabel}
                        </span>
                      ) : null}
                    </motion.button>
                  </AnimatePresence>
              </span>
            }
            description={
              <span className="flex flex-wrap items-center gap-x-4 gap-y-3">
                {channels.map((channel) => {
                  return (
                    <button
                      key={`logo-${channel.key}`}
                      type="button"
                      onClick={() => setActiveChannel(channel.key)}
                      aria-label={channel.label}
                      title={channel.label}
                      className="inline-flex items-center justify-center transition"
                    >
                      <LogoIcon slug={channel.logoSlug} size={40} className="text-foreground sm:scale-100 scale-90" />
                    </button>
                  );
                })}
              </span>
            }
            descriptionOpacity="default"
            descriptionClassName="max-w-none"
          />

          <div className="relative mx-auto w-full max-w-[360px] sm:max-w-[390px]">
            <div className="pointer-events-none absolute left-1/2 top-8 h-40 w-40 -translate-x-1/2 rounded-full bg-[#25d366]/18 blur-3xl" />

            <div className="relative rounded-[2.8rem] border border-black/10 bg-[#111b21] p-3 shadow-[0_28px_90px_rgba(8,15,20,0.28)] dark:border-white/10">
              <div className="mx-auto mb-3 h-1.5 w-24 rounded-full bg-white/10" />

              <div className="overflow-hidden rounded-[2.2rem] border border-white/10 bg-[#0f1720]">
                <AnimatePresence mode="wait">
                  {active.screenSrc ? (
                    <motion.img
                      key={active.screenSrc}
                      src={active.screenSrc}
                      alt={`${active.label} chat screen`}
                      className="h-[560px] sm:h-[620px] w-full object-cover object-top"
                      initial={{ opacity: 0, scale: 1.02 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.99 }}
                      transition={{ duration: 0.28, ease: "easeOut" }}
                    />
                  ) : (
                    <motion.div
                      key={`${activeChannel}-placeholder`}
                      className="flex h-[620px] w-full flex-col items-center justify-center bg-[linear-gradient(165deg,#101925,#172537)] px-6 text-center"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.22, ease: "easeOut" }}
                    >
                      <p className="text-sm font-medium text-white">{active.label} mock pending</p>
                      <p className="mt-2 text-xs leading-5 text-white/60">
                        Add `/public/images/{activeChannel}-mock.png` to enable this view.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Container>
  );
}
