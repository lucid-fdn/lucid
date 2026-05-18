"use client";

import Image from "next/image";
import Marquee from "react-fast-marquee";
import { Container } from "./container";
import { SectionHeader } from "./section-header";
import { cn } from "@/components/marketing/lucid/lib/utils";
import { LogoIcon } from "@/components/ui/logo-icon";
import { ModelIcon } from "@/components/icons/model-icon";

type Brand =
  | {
      name: string;
      type: "local";
      src: string;
      className?: string;
    }
  | {
      name: string;
      type: "model";
      provider: string;
      className?: string;
    }
  | { name: string; type: "slug"; slug: string; className?: string };

const MODELS_AND_AGENTS: Brand[] = [
  { name: "Lucid", type: "local", src: "/lucid.png", className: "rounded-none" },
  { name: "OpenAI", type: "model", provider: "openai" },
  { name: "Anthropic", type: "model", provider: "anthropic" },
  { name: "Meta", type: "model", provider: "meta" },
  { name: "Mistral", type: "model", provider: "mistral" },
  { name: "DeepSeek", type: "model", provider: "deepseek" },
  { name: "OpenClaw", type: "local", src: "/logos/openclaw.svg" },
  { name: "Hermes", type: "local", src: "/logos/nous.jpeg" },
];

const APPS: Brand[] = [
  { name: "Linear", type: "slug", slug: "linear" },
  { name: "Notion", type: "slug", slug: "notion" },
  { name: "Slack", type: "slug", slug: "slack" },
  { name: "WhatsApp", type: "slug", slug: "whatsapp" },
  { name: "Discord", type: "slug", slug: "discord" },
  { name: "Telegram", type: "slug", slug: "telegram" },
  { name: "HubSpot", type: "slug", slug: "hubspot" },
  { name: "Stripe", type: "slug", slug: "stripe" },
  { name: "Gmail", type: "slug", slug: "gmail" },
];

function BrandTile({ brand }: { brand: Brand }) {
  return (
    <div
      className="mx-5 flex h-10 w-10 items-center justify-center md:mx-8 md:h-12 md:w-12"
      aria-label={brand.name}
      title={brand.name}
    >
      {brand.type === "local" ? (
        <Image
          src={brand.src}
          alt={brand.name}
          width={28}
          height={28}
          className={cn("h-7 w-7 object-contain md:h-8 md:w-8", brand.className)}
        />
      ) : brand.type === "model" ? (
        <ModelIcon provider={brand.provider} size={30} className={brand.className} />
      ) : (
        <LogoIcon slug={brand.slug} size={30} className="text-white" />
      )}
    </div>
  );
}

export function LogoMarquee() {
  return (
    <Container className="border-divide border-x">
      <div className="relative overflow-hidden py-16">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,121,27,0.12),transparent_45%)]" />
        <SectionHeader
          badge="One system"
          title="All models, agents, and apps. One system."
          description="Run frontier and open-source models, specialized agents, and real integrations from one operating layer."
          descriptionClassName="max-w-3xl px-4"
        />
        <div className="mt-14 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
          <Marquee pauseOnHover speed={34} gradient={false}>
            {MODELS_AND_AGENTS.concat(MODELS_AND_AGENTS).map((brand, index) => (
              <BrandTile key={`top-${brand.name}-${index}`} brand={brand} />
            ))}
          </Marquee>
        </div>
        <div className="mt-6 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
          <Marquee pauseOnHover speed={28} direction="right" gradient={false}>
            {APPS.concat(APPS).map((brand, index) => (
              <BrandTile key={`bottom-${brand.name}-${index}`} brand={brand} />
            ))}
          </Marquee>
        </div>
      </div>
    </Container>
  );
}
