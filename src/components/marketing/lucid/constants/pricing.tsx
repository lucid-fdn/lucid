import { CheckIcon } from "@/components/marketing/lucid/icons/card-icons";
import { CloseIcon } from "@/components/marketing/lucid/icons/general";

export enum TierName {
  TIER_1 = "Starter",
  TIER_2 = "Growth",
  TIER_3 = "Scale",
}

export const tiers = [
  {
    title: TierName.TIER_1,
    subtitle: "Launch your first autonomous agents",
    monthly: 29,
    yearly: 24,
    ctaText: "Start building",
    ctaLink: "/sign-up",
    features: [
      "Real autonomous agents on shared compute",
      "Persistent platform-managed memory",
      "500 execution credits per month",
      "1 concurrent run",
      "Up to 3 agent teams",
      "Best for solo builders",
    ],
  },
  {
    title: TierName.TIER_2,
    subtitle: "For production and long-running autonomy",
    monthly: 99,
    yearly: 79,
    ctaText: "Start building",
    ctaLink: "/sign-up",
    features: [
      "Real autonomous agents on shared compute",
      "Persistent memory and autonomous execution",
      "2,500 execution credits per month",
      "5 concurrent runs",
      "Up to 10 agent teams",
      "Full Mission Control visibility and policy rails",
      "Best for real production use",
    ],
    featured: true,
  },
  {
    title: TierName.TIER_3,
    subtitle: "Private deployment with full control and security",
    monthly: 299,
    yearly: 199,
    ctaText: "Start building",
    ctaLink: "/contact",
    features: [
      "Isolated runtime identity and stronger continuity",
      "Higher headroom for heavy long-running workloads",
      "Best for continuous, long-running autonomous agents",
      "Higher or custom execution limits",
      "Higher concurrency",
      "25+ agent teams",
      "Best for heavy autonomy and continuity",
    ],
  },
];

export const pricingTable = [
  {
    title: "Runtime model",
    tiers: [
      {
        title: TierName.TIER_1,
        value: "Managed shared",
      },
      {
        title: TierName.TIER_2,
        value: "Managed shared",
      },
      {
        title: TierName.TIER_3,
        value: "Isolated runtime",
      },
    ],
  },
  {
    title: "Persistent platform memory",
    tiers: [
      {
        title: TierName.TIER_1,
        value: "Yes",
      },
      {
        title: TierName.TIER_2,
        value: "Yes",
      },
      {
        title: TierName.TIER_3,
        value: "Yes",
      },
    ],
  },
  {
    title: "Runtime-local continuity",
    tiers: [
      {
        title: TierName.TIER_1,
        value: <CloseIcon className="mx-auto size-5 text-gray-600" />,
      },
      {
        title: TierName.TIER_2,
        value: <CloseIcon className="mx-auto size-5 text-gray-600" />,
      },
      {
        title: TierName.TIER_3,
        value: <CheckIcon className="mx-auto size-5 text-gray-600" />,
      },
    ],
  },
  {
    title: "Agent teams",
    tiers: [
      {
        title: TierName.TIER_1,
        value: "Up to 3",
      },
      {
        title: TierName.TIER_2,
        value: "Up to 10",
      },
      {
        title: TierName.TIER_3,
        value: "25+",
      },
    ],
  },
  {
    title: "Execution credits",
    tiers: [
      {
        title: TierName.TIER_1,
        value: "500 / month",
      },
      {
        title: TierName.TIER_2,
        value: "2,500 / month",
      },
      {
        title: TierName.TIER_3,
        value: "Higher or custom",
      },
    ],
  },
  {
    title: "Concurrent runs",
    tiers: [
      {
        title: TierName.TIER_1,
        value: "1",
      },
      {
        title: TierName.TIER_2,
        value: "5",
      },
      {
        title: TierName.TIER_3,
        value: "Higher",
      },
    ],
  },
  {
    title: "Background jobs and schedules",
    tiers: [
      {
        title: TierName.TIER_1,
        value: "Yes, with limits",
      },
      {
        title: TierName.TIER_2,
        value: "Yes",
      },
      {
        title: TierName.TIER_3,
        value: "Strong",
      },
    ],
  },
  {
    title: "Isolation and noisy-neighbor protection",
    tiers: [
      {
        title: TierName.TIER_1,
        value: "Low",
      },
      {
        title: TierName.TIER_2,
        value: "Medium",
      },
      {
        title: TierName.TIER_3,
        value: "High",
      },
    ],
  },
  {
    title: "Long-running workload headroom",
    tiers: [
      {
        title: TierName.TIER_1,
        value: "Low",
      },
      {
        title: TierName.TIER_2,
        value: "Moderate",
      },
      {
        title: TierName.TIER_3,
        value: "High",
      },
    ],
  },
  {
    title: "Mission Control and policy rails",
    tiers: [
      {
        title: TierName.TIER_1,
        value: "Basic",
      },
      {
        title: TierName.TIER_2,
        value: "Full",
      },
      {
        title: TierName.TIER_3,
        value: "Full",
      },
    ],
  },
  {
    title: "Best fit",
    tiers: [
      {
        title: TierName.TIER_1,
        value: "Trial and sandbox",
      },
      {
        title: TierName.TIER_2,
        value: "Production shared",
      },
      {
        title: TierName.TIER_3,
        value: "Heavy autonomy",
      },
    ],
  },
];
