"use client"

export const dynamic = 'force-dynamic'

import React, { useState, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { FEATURES } from "@/lib/features"
import { getCSRFTokenFromCookie } from "@/lib/auth/csrf-client"
import { ArrowLeft, ArrowRight, Download, Trophy, ChevronDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from '@/hooks/use-toast'
import {
  Brain,
  Cog,
  Cpu,
  Eye,
  Gamepad,
  HelpCircle,
  ImageIcon,
  Lightbulb,
  Loader2,
  Lock,
  MessageSquare,
  Plus,
  Sparkles,
  Upload,
  FileText,
  Search,
  Settings,
  X,
  Database,
  FileUp,
  FileCode,
  Code,
  Layers,
  Star,
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/radix-tabs"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { useAgentCreationState, type AgentCreationState } from "@/hooks/useAgentCreationState"
import {
  getLatestAvatarPartialUrl,
  waitForAgentAvatarJob,
  type SerializedAgentAvatarJob,
} from "@/lib/ai/agent-avatar/client-job-stream"
import Image from "next/image"
import { Skeleton } from "@/components/ui/skeleton"
import { GeneratingLoader } from "@/components/ui/generating-loader"
import { DEFAULT_AGENT_ID } from "@/constants/agents"

// Types
interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

interface TagSelectorProps {
  tags: string[];
  selectedTags: string[];
  onTagToggle: (tag: string) => void;
}

interface CapabilityItemProps {
  action: {
    name: string;
    description: string;
    tags: string[];
    builder: string;
  };
  isEnabled: boolean;
  onClick: () => void;
  builder: string;
}

interface Action {
  id: number;
  name: string;
  description: string;
  tags: string[];
  builder: string;
}

// Add builder configuration at the top of the file
const BUILDER_CONFIG = {
  Lucid: {
    logo: "/logos/icon/avalanche.svg",
    bgColor: "bg-[#000000]/10",
    borderColor: "border-border",
    hoverBgColor: "hover:bg-[#E84142]/20",
    bgImage: "bg-[url('https://ik.imagekit.io/g1noocuou2/tr:bl-20/raijinlabs_cyberpunk_city_full_sky_of_star_a_bog_planet_high_de_0eba6fd2-64ec-48c6-9373-81b26b9d9e5f.png')] bg-cover bg-center",
    description: "Default capabilities builder"
  },
  Fortnite: {
    logo: "/games/fortnite.png",
    bgColor: "bg-[#000000]/10",
    borderColor: "border-border",
    hoverBgColor: "hover:bg-[#2F2F2F]/20",
    bgImage: "bg-[url('https://ik.imagekit.io/g1noocuou2/tr:bl-20/fortnite3.jpg')] bg-cover bg-center",
    description: "Game-specific capabilities"
  }
} as const;

const AVATAR_STYLE_OPTIONS = [
  { value: 'lucid-studio', label: 'Lucid Studio' },
  { value: 'professional-portrait', label: 'Professional' },
  { value: 'soft-3d', label: 'Soft 3D' },
  { value: 'editorial-illustration', label: 'Editorial' },
  { value: 'anime-editorial', label: 'Anime' },
  { value: 'cinematic-real', label: 'Cinematic' },
  { value: 'minimal-mascot', label: 'Mascot' },
]

const AVATAR_EXPRESSION_OPTIONS = [
  { value: 'neutral-friendly', label: 'Friendly' },
  { value: 'confident', label: 'Confident' },
  { value: 'warm', label: 'Warm' },
  { value: 'focused', label: 'Focused' },
]

const AVATAR_BACKGROUND_OPTIONS = [
  { value: 'subtle-depth', label: 'Subtle' },
  { value: 'clean-light', label: 'Light' },
  { value: 'clean-dark', label: 'Dark' },
  { value: 'transparent-safe', label: 'Transparent' },
]

const AVATAR_GENDER_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'masculine', label: 'Male' },
  { value: 'feminine', label: 'Woman' },
]

const AVATAR_POSE_OPTIONS = [
  { value: 'standard-portrait', label: 'Standard' },
  { value: 'confident-shoulder-turn', label: 'Shoulder turn' },
  { value: 'thoughtful-listener', label: 'Thoughtful' },
  { value: 'calm-operator', label: 'Operator' },
]

function normalizeAvatarProgress(value: number | null | undefined): number {
  return Math.max(5, Math.min(100, typeof value === 'number' ? value : 8))
}

function formatAvatarGenerationStatus(job: SerializedAgentAvatarJob): string {
  const percent = typeof job.progressPercent === "number" ? ` ${job.progressPercent}%` : ""
  if (job.status === "queued") return "Queued"
  if (job.progressStage === "preview") return `Preview ready${percent}`
  if (job.progressStage === "completed") return "Finalizing 100%"
  if (job.progressStage === "starting") return `Starting${percent}`
  return `Rendering${percent}`
}

// SearchBar component for reusable search functionality
const SearchBar = React.memo(({ value, onChange, placeholder }: SearchBarProps) => {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        className="bg-input border-0 pl-9 focus-visible:ring-primary"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
})
SearchBar.displayName = "SearchBar"

// TagSelector component for reusable tag selection
const TagSelector = React.memo(({ tags, selectedTags, onTagToggle }: TagSelectorProps) => {
  const getIcon = (tag: string) => {
    switch (tag) {
      case "Lucid":
        return "/logos/icon/avalanche.svg";
      case "Gaming":
        return "/games/fortnite.png";
      case "Fortnite":
        return "/games/fortnite.png";
      default:
        return "/placeholder.svg";
    }
  };

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {tags.map((tag) => {
        const icon = getIcon(tag);
        return (
          <Badge
            key={tag}
            variant={selectedTags.includes(tag) ? "default" : "outline"}
            className={`flex items-center gap-1.5 px-3 py-0.5 ${icon ? 'pl-0.5' : 'px-3'} rounded-full ${
              selectedTags.includes(tag)
                ? "bg-primary text-primary-foreground cursor-pointer"
                : "border-border text-muted-foreground hover:border-primary hover:text-primary cursor-pointer"
            }`}
            onClick={() => onTagToggle(tag)}
          >
            {icon && (
              <div className="w-4 h-4 rounded-full overflow-hidden relative">
                <Image
                  src={icon}
                  alt={tag}
                  width={16}
                  height={16}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            {tag}
          </Badge>
        );
      })}
    </div>
  )
})
TagSelector.displayName = "TagSelector"

// CapabilityItem component for each capability in the list
const CapabilityItem: React.FC<CapabilityItemProps> = React.memo(({ action, isEnabled, onClick, builder }) => {
  // Get the logo and background based on the builder
  const getBuilderStyle = (builder: string) => {
    return BUILDER_CONFIG[builder as keyof typeof BUILDER_CONFIG] || {
      logo: "/placeholder.svg",
      bgColor: "bg-secondary",
      borderColor: "border-border",
      hoverBgColor: "hover:bg-secondary/80",
      bgImage: "bg-[url('https://ik.imagekit.io/g1noocuou2/tr:bl-30/raijinlabs_cyberpunk_city_full_sky_of_star_a_bog_planet_high_de_0eba6fd2-64ec-48c6-9373-81b26b9d9e5f.png')] bg-cover bg-center",
      description: "Custom builder"
    };
  };

  const builderStyle = getBuilderStyle(builder);

  return (
    <div
      className={`relative overflow-hidden rounded-lg cursor-pointer border-2 transition-all mb-3 ${
        isEnabled 
          ? `${builderStyle.bgColor} ${builderStyle.borderColor} border-primary` 
          : `${builderStyle.borderColor} ${builderStyle.hoverBgColor} hover:border-border/60`
      }`}
      onClick={onClick}
    >
      {/* Background Image */}
      <div className={`absolute hover:border-border/60 inset-0 opacity-15 ${builderStyle.bgImage}`} />
      
      {/* Content */}
      <div className="relative z-10 p-3">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${builderStyle.bgColor} overflow-hidden`}>
            <Image
              src={builderStyle.logo}
              alt={builder}
              width={32}
              height={32}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1">
            <Label className="text-base">{action.name}</Label>
            <p className="text-xs text-muted-foreground">{action.description}</p>
            <div className="flex gap-1 mt-1">
              {action.tags.map((tag: string) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="text-[10px] px-1 py-0 h-4 border-border text-muted-foreground"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

CapabilityItem.displayName = "CapabilityItem";

// NoResultsFound component for empty search results
const NoResultsFound = React.memo(() => (
  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
    <Search className="w-12 h-12 mb-2 opacity-50" />
    <p>No actions found</p>
    <p className="text-sm">Try a different search term or tag</p>
  </div>
))
NoResultsFound.displayName = "NoResultsFound"

// Add validation functions at the top of the file, before the component
const validateBasicInfo = (data: AgentCreationState): boolean => {
  return !!(
    data.name &&
    data.description &&
    data.category &&
    data.blockchain &&
    data.visibility
  );
};

const validateCapabilities = (data: AgentCreationState): boolean => {
  // Check if at least one capability is enabled
  return Object.values(data.capabilities).some(enabled => enabled);
};

const validateModelSettings = (data: AgentCreationState): boolean => {
  return !!(
    data.instructions && // Require instructions
    data.modelSettings.communicationStyle && // Require communication style
    // All model settings should be numbers between 0-100
    typeof data.modelSettings.responseSpeed === 'number' &&
    typeof data.modelSettings.accuracy === 'number' &&
    typeof data.modelSettings.creativity === 'number' &&
    typeof data.modelSettings.complexity === 'number'
  );
};

const validatePublish = (_data: AgentCreationState): boolean => {
  // Add any final validation checks before publishing
  return true;
};

export default function CreateAgent() {
  const router = useRouter()
  const toast = useToast()
  const [walletConnected, _setWalletConnected] = useState(false)
  const { state: agentData, setState: setAgentData, isLoading } = useAgentCreationState();
  const [isPublishing, setIsPublishing] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [isGeneratingInstructions, setIsGeneratingInstructions] = useState(false);
  const totalSteps = 4;
  const [termsAgreed, setTermsAgreed] = useState(false);

  // Move allActions to component scope
  const allActions: Action[] = [
    { id: 1, name: "Real-time Analysis", description: "Analyze gameplay in real-time", tags: ["Gaming", "Lucid"], builder: "Lucid" },
    { id: 2, name: "Voice Commands", description: "Respond to voice instructions", tags: ["Gaming"], builder: "Fortnite" },
    {
      id: 3,
      name: "Post-match Reports",
      description: "Generate detailed analysis after games",
      tags: ["Gaming", "Lucid"],
      builder: "Lucid"
    },
    { id: 4, name: "Opponent Prediction", description: "Predict opponent strategies", tags: ["Gaming", "Fortnite"], builder: "Fortnite" },
    { id: 5, name: "Resource Optimization", description: "Optimize resource management", tags: ["Fortnite"], builder: "Fortnite" },
    { id: 6, name: "Trade Analysis", description: "Analyze trading patterns", tags: ["Lucid"], builder: "Lucid" },
    { id: 7, name: "Market Search", description: "Search for market opportunities", tags: ["Lucid"], builder: "Lucid" },
  ];

  const handleNext = useCallback(() => {
    // Validate current step before proceeding
    let isValid = false;
    switch (agentData.currentStep) {
      case 1:
        isValid = validateBasicInfo(agentData);
        break;
      case 2:
        isValid = validateCapabilities(agentData);
        break;
      case 3:
        isValid = validateModelSettings(agentData);
        break;
      case 4:
        isValid = validatePublish(agentData);
        break;
      default:
        isValid = true;
    }

    if (!isValid) {
      toast.error("Please fill in all required fields before proceeding.");
      return;
    }
    
    if (!agentData.currentStep || agentData.currentStep < totalSteps) {
      const nextStep = (agentData.currentStep || 1) + 1;

      setAgentData({
        currentStep: nextStep
      });
    }
  }, [agentData, totalSteps, setAgentData, toast]);

  const handleBack = useCallback(() => {
    if (agentData.currentStep && agentData.currentStep > 1) {
      const prevStep = agentData.currentStep - 1;

      setAgentData({
        currentStep: prevStep
      });
    }
  }, [agentData.currentStep, setAgentData]);

  const handlePublish = useCallback(async () => {
    try {
      // Validate all steps before publishing
      if (!validateBasicInfo(agentData)) {
        toast.error("Please complete the Basic Information section");
        return;
      }
      if (!validateCapabilities(agentData)) {
        toast.error("Please select at least one capability");
        return;
      }
      if (!validateModelSettings(agentData)) {
        toast.error("Please complete the Model Settings section");
        return;
      }

      // Agent publishing is not yet wired to Supabase
      toast.error("Agent publishing is temporarily unavailable. Please try again later.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to publish agent. Please try again.");
    } finally {
      setIsPublishing(false);
    }
  }, [agentData, router, toast]);

  const handleInputChange = useCallback((field: keyof AgentCreationState, value: unknown) => {
    setAgentData({ [field]: value });
  }, [setAgentData]);

  const handleCapabilityChange = useCallback((capability: string, value: boolean) => {
    setAgentData({
      capabilities: {
        ...agentData.capabilities,
        [capability]: value
      }
    });
  }, [agentData.capabilities, setAgentData]);

  const handleModelSettingChange = useCallback((setting: string, value: number | string) => {
    setAgentData({
      modelSettings: {
        ...agentData.modelSettings,
        [setting]: value
      }
    });
  }, [agentData.modelSettings, setAgentData]);

  const handleAdvancedSettingChange = useCallback((setting: string, value: unknown) => {
    setAgentData({
      advancedSettings: {
        ...agentData.advancedSettings,
        [setting]: value
      }
    });
  }, [agentData.advancedSettings, setAgentData]);

  const handleTagToggle = useCallback((tag: string) => {
    setAgentData({
      selectedTags: agentData.selectedTags.includes(tag)
        ? agentData.selectedTags.filter(t => t !== tag)
        : [...agentData.selectedTags, tag]
    });
  }, [agentData.selectedTags, setAgentData]);

  const _handleGameConfig = useCallback((game: string) => {
    setAgentData({
      currentGameConfig: game,
      showGameConfigModal: true
    });
  }, [setAgentData]);

  const handleGenerateImage = useCallback(async () => {
    try {
      setAgentData({
        isGeneratingImage: true,
        imageGenerationStatus: "Queued",
        imageGenerationProgress: 8,
        showAIImageModal: false,
        intermediateImage: null,
      });

      toast.info(`Your ${agentData.aiImageType} image is being generated...`);

      const isProfile = agentData.aiImageType === "profile";
      const prompt = agentData.aiImagePrompt.trim()
        || `${agentData.name || "Lucid Agent"}: ${agentData.description || "a capable AI agent"}`;
      let csrf = getCSRFTokenFromCookie();
      if (!csrf) {
        await fetch('/api/auth/csrf', { credentials: 'same-origin' }).catch(() => null);
        csrf = getCSRFTokenFromCookie();
      }
      const response = await fetch(isProfile ? "/api/agents/avatar/generate" : "/api/ai/image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify(isProfile ? {
          draftId: crypto.randomUUID(),
          name: agentData.name || "Lucid Agent",
          role: agentData.category || undefined,
          description: prompt,
          stylePreset: agentData.aiImageStyle,
          expression: agentData.aiImageExpression,
          background: agentData.aiImageBackground,
          angle: agentData.aiImageAngle,
          genderPresentation: agentData.aiImageGenderPresentation,
          pose: agentData.aiImagePose,
          referenceImageUrl: agentData.aiImageLockIdentity ? agentData.profileImage ?? undefined : undefined,
          lockIdentity: Boolean(agentData.aiImageLockIdentity && agentData.profileImage),
        } : {
          purpose: "agent-cover",
          prompt,
          stylePreset: agentData.aiImageStyle,
          size: "1536x1024",
          quality: "high",
          outputFormat: "webp",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate image");
      }

      const data = await response.json();
      let result = data?.data;
      if (isProfile && result?.id && !result?.url) {
        result = await waitForAgentAvatarJob(result.id, {
          onUpdate: (job: SerializedAgentAvatarJob) => {
            const previewUrl = getLatestAvatarPartialUrl(job)
            const status = formatAvatarGenerationStatus(job)
            if (previewUrl) {
              setAgentData({
                intermediateImage: previewUrl,
                imageGenerationStatus: status,
                imageGenerationProgress: normalizeAvatarProgress(job.progressPercent),
                isGeneratingImage: true,
              })
            } else {
              setAgentData({
                imageGenerationStatus: status,
                imageGenerationProgress: normalizeAvatarProgress(job.progressPercent),
                isGeneratingImage: true,
              })
            }
          },
        });
      }
      const imageUrl = result?.url;
      if (!imageUrl) throw new Error("No image URL returned");

      setAgentData({
        [isProfile ? "profileImage" : "coverImage"]: imageUrl,
        ...(isProfile ? {
          profileImageAssetId: result.id,
          profileImageSpec: result.metadata ?? null,
          profileImagePromptVersion: result.metadata?.promptVersion ?? "agent-avatar-v1",
          profileImageProvider: result.provider,
          profileImageModel: result.model,
        } : {}),
        intermediateImage: null,
        imageGenerationStatus: null,
        imageGenerationProgress: 0,
        isGeneratingImage: false,
      });
      toast.success(`Your ${agentData.aiImageType} image has been created successfully!`);

    } catch (error) {
      setAgentData({ isGeneratingImage: false, intermediateImage: null, imageGenerationStatus: null, imageGenerationProgress: 0 });
      toast.error(error instanceof Error ? error.message : "Failed to generate image. Please try again.");
    }
  }, [agentData, setAgentData, toast]);

  // Memoized render functions
  const renderBasicInfo = useMemo(() => {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-2">Basic Information</h2>
          <p className="text-muted-foreground">Let's start with the fundamental details of your AI agent.</p>
        </div>

        <div className="bg-card border-l-4 border-primary p-4 rounded-r-lg mb-6">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-primary" />
              <h3 className="font-medium text-primary">Creating an Effective AI Agent</h3>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Focus on a specific gaming need rather than trying to do everything. Agents with clear, focused capabilities
            tend to perform better and attract more users.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agent-name">
                Agent Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="agent-name"
                placeholder="e.g., StrategyMaster AI"
                value={agentData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                className="bg-input border-0 focus-visible:ring-primary"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-description">
                Description <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Textarea
                  id="agent-description"
                  placeholder="Describe what your AI agent does and its key benefits..."
                  value={agentData.description}
                  onChange={(e) => handleInputChange("description", e.target.value)}
                  className={`bg-input border-0 focus-visible:ring-primary min-h-[120px] transition-colors duration-240 ${
                    isGeneratingDescription ? 'text-transparent' : 'text-foreground'
                  }`}
                  disabled={isGeneratingDescription}
                />
                {isGeneratingDescription && <GeneratingLoader word="Description" />}
                {!isGeneratingDescription && (
                  <Button
                    className="absolute bottom-2 right-2 bg-primary/20 hover:bg-primary/30 text-primary"
                    size="sm"
                    onClick={async () => {
                      try {
                        setIsGeneratingDescription(true);
                        
                        // Prepare the prompt with context
                        const prompt = `Generate a compelling description for an AI agent with the following details:
                        - Name: ${agentData.name || "AI Agent"}
                        - Category: ${agentData.category || "Gaming"}
                        - Blockchain: ${agentData.blockchain === "solana" ? "Solana" : "Avalanche"}
                        - Capabilities: ${Object.entries(agentData.capabilities)
                          .filter(([_, enabled]) => enabled)
                          .map(([key]) => key.replace(/([A-Z])/g, " $1").trim())
                          .join(", ") || "Real-time analysis and personalized recommendations"}
                        
                        Please create a concise, engaging description (max 200 words) that highlights the agent's value proposition and key features. Focus on what makes this agent unique and how it helps users.`

                        // Make API call to generate description
                        const response = await fetch(`/api/chat/create?agent_ids=${DEFAULT_AGENT_ID}`, {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({ 
                            message: prompt,
                            maxTokens: 200
                          }),
                        })

                        if (!response.ok) {
                          throw new Error("Failed to generate description")
                        }

                        const data = await response.json()
                        
                        if (!data.message) {
                          throw new Error("No description generated")
                        }

                        // Update the description field with the generated text
                        handleInputChange("description", data.message)
                        toast.success("AI has generated a description based on your agent details.")
                      } catch {
                        toast.error("Failed to generate description. Please try again.")
                      } finally {
                        setIsGeneratingDescription(false)
                      }
                    }}
                  >
                    <Sparkles className="w-3 h-3 mr-1" /> Generate with AI
                  </Button>
                )}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Be clear and specific about your agent's capabilities</span>
                <span>{(agentData.description || "").length}/500</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-category">
                Category <span className="text-red-500">*</span>
              </Label>
              <Select value={agentData.category} onValueChange={(value) => handleInputChange("category", value)}>
                <SelectTrigger className="bg-input border-0 focus:ring-primary">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="strategy">Strategy</SelectItem>
                  <SelectItem value="fps">FPS</SelectItem>
                  <SelectItem value="rpg">RPG</SelectItem>
                  <SelectItem value="racing">Racing</SelectItem>
                  <SelectItem value="simulation">Simulation</SelectItem>
                  <SelectItem value="moba">MOBA</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>
                Blockchain <span className="text-red-500">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-4">
                <div
                  className={`flex items-center gap-2 p-3 rounded-lg cursor-pointer border-2 transition-all ${agentData.blockchain === "solana" ? "border-primary bg-primary/10" : "border-border hover:border-border/60"}`}
                  onClick={() => handleInputChange("blockchain", "solana")}
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center">
                    <Image src="/logos/icon/solana.svg" alt="Solana" width={32} height={32} className="w-8 h-8" />
                  </div>
                  <span className="font-medium">Solana</span>
                </div>

                <div
                  className={`flex items-center gap-2 p-3 rounded-lg cursor-pointer border-2 transition-all ${agentData.blockchain === "avalanche" ? "border-primary bg-primary/10" : "border-border hover:border-border/60"}`}
                  onClick={() => handleInputChange("blockchain", "avalanche")}
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center">
                    <Image src="/logos/icon/avalanche.svg" alt="Avalanche" width={32} height={32} className="w-8 h-8" />
                  </div>
                  <span className="font-medium">Avalanche</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>
                Visibility <span className="text-red-500">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-4">
                <div
                  className={`flex items-center gap-2 p-3 rounded-lg cursor-pointer border-2 transition-all ${agentData.visibility === "public" || !agentData.visibility ? "border-primary bg-primary/10" : "border-border hover:border-border/60"}`}
                  onClick={() => handleInputChange("visibility", "public")}
                >
                  <div className="w-8 h-8 rounded-full bg-[#171A1B] flex items-center justify-center">
                    <Eye className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <span className="font-medium">Public</span>
                    <p className="text-xs text-muted-foreground">Available in marketplace</p>
                  </div>
                </div>

                <div
                  className={`flex items-center gap-2 p-3 rounded-lg cursor-pointer border-2 transition-all ${agentData.visibility === "private" ? "border-primary bg-primary/10" : "border-border hover:border-border/60"}`}
                  onClick={() => handleInputChange("visibility", "private")}
                >
                  <div className="w-8 h-8 rounded-full bg-[#171A1B] flex items-center justify-center">
                    <Lock className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <span className="font-medium">Private</span>
                    <p className="text-xs text-muted-foreground">Only for your use</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>
                Images <span className="text-red-500">*</span>
              </Label>

              {!agentData.showAIImageModal ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Profile Image</p>
                      <div className="border-2 border-dashed border-border rounded-lg p-2 text-center hover:border-primary/50 transition-colors cursor-pointer h-[180px] flex flex-col items-center justify-center">
                        {agentData.isGeneratingImage && agentData.aiImageType === "profile" ? (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-2">
                            <div
                              className="relative h-24 w-24 rounded-full p-[2px]"
                              style={{
                                background: `conic-gradient(var(--primary) ${normalizeAvatarProgress(agentData.imageGenerationProgress) * 3.6}deg, color-mix(in oklab, var(--border) 78%, transparent) 0deg)`,
                              }}
                            >
                              <div className="relative h-full w-full overflow-hidden rounded-full border border-border bg-muted/40">
                                {agentData.intermediateImage ? (
                                  <Image
                                    src={agentData.intermediateImage}
                                    alt="Intermediate"
                                    fill
                                    className="object-cover animate-pulse"
                                  />
                                ) : (
                                  <>
                                    <Skeleton className="h-full w-full rounded-full" />
                                    <ImageIcon className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 text-muted-foreground/60" />
                                  </>
                                )}
                                <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent_15%,rgba(255,255,255,0.22)_45%,transparent_75%)] animate-pulse" />
                                <div className="absolute inset-0 flex items-center justify-center bg-background/35 backdrop-blur-[1px]">
                                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                </div>
                              </div>
                            </div>
                            <div className="min-h-4 text-xs text-muted-foreground">
                              {agentData.imageGenerationStatus ?? "Rendering"}
                            </div>
                          </div>
                        ) : agentData.profileImage ? (
                          <div className="relative w-full h-full">
                            <Image
                              src={agentData.profileImage || "/placeholder.svg"}
                              alt="Profile"
                              fill
                              className="w-full h-full object-cover rounded-lg"
                            />
                            <div className="absolute bottom-0 right-0 flex gap-1">
                              <Button
                                variant="default"
                                size="icon"
                                className="h-8 w-8 bg-black/50 hover:bg-black/70 backdrop-blur-sm"
                                onClick={() => window.open(agentData.profileImage || '', '_blank')}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="default"
                                size="icon"
                                className="h-8 w-8 bg-black/50 hover:bg-black/70 backdrop-blur-sm"
                                onClick={() => setAgentData({
                                  profileImage: null,
                                  profileImageAssetId: null,
                                  profileImageSpec: null,
                                  profileImagePromptVersion: null,
                                  profileImageProvider: null,
                                  profileImageModel: null,
                                  imageGenerationProgress: 0,
                                })}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="w-full h-full rounded-lg bg-[#171A1B] flex items-center justify-center mb-3">
                              <ImageIcon className="w-8 h-8 text-muted-foreground" />
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">Upload profile image</p>
                            <Button size="sm" variant="outline" className="text-xs border-primary text-primary">
                              <Upload className="w-3 h-3 mr-1" /> Upload
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Cover Image</p>
                      <div className="border-2 border-dashed border-border rounded-lg p-2 text-center hover:border-primary/50 transition-colors cursor-pointer h-[180px] flex flex-col items-center justify-center">
                        {agentData.isGeneratingImage && agentData.aiImageType === "cover" ? (
                          <div className="flex flex-col items-center justify-center h-full w-full">
                            <div className="relative w-full h-full">
                              {agentData.intermediateImage ? (
                                <Image
                                  src={agentData.intermediateImage}
                                  alt="Intermediate"
                                  fill
                                  className="w-full h-full object-cover rounded-md animate-pulse"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Skeleton className="w-full h-full rounded-md" />
                                  <div className="absolute inset-0 flex items-center justify-center p-2">
                                    <div className="max-w-[120px] text-center">
                                      <GeneratingLoader word="Image" />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : agentData.coverImage ? (
                          <div className="relative w-full h-full">
                            <Image
                              src={agentData.coverImage || "/placeholder.svg"}
                              alt="Cover"
                              fill
                              className="w-full h-full object-cover rounded-md"
                            />
                            <div className="absolute bottom-0 right-0 flex gap-1">
                              <Button
                                variant="default"
                                size="icon"
                                className="h-8 w-8 bg-black/50 hover:bg-black/70 backdrop-blur-sm"
                                onClick={() => window.open(agentData.coverImage || '', '_blank')}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="default"
                                size="icon"
                                className="h-8 w-8 bg-black/50 hover:bg-black/70 backdrop-blur-sm"
                                onClick={() => handleInputChange("coverImage", null)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="w-full h-full rounded-md bg-[#171A1B] flex items-center justify-center mb-3">
                              <ImageIcon className="w-8 h-8 text-muted-foreground" />
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">Upload cover image</p>
                            <Button size="sm" variant="outline" className="text-xs border-primary text-primary">
                              <Upload className="w-3 h-3 mr-1" /> Upload
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {FEATURES.aiImageGeneration && (
                    <Button
                      className="w-full mt-2 bg-primary/20 hover:bg-primary/30 text-primary"
                      onClick={() => {
                        setAgentData({
                          ...agentData,
                          showAIImageModal: true,
                        })
                      }}
                    >
                      <Sparkles className="w-4 h-4 mr-2" /> Customize with AI
                    </Button>
                  )}
                </>
              ) : (
                <div className="bg-card p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-medium flex items-center">
                      <Sparkles className="w-4 h-4 mr-2 text-primary" /> AI Image Generation
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => {
                        setAgentData({
                          ...agentData,
                          showAIImageModal: false,
                        })
                      }}
                    >
                      Back to Upload
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label className="mb-2 block">Image Type</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <div
                          className={`border-2 ${agentData.aiImageType === "profile" ? "border-primary bg-primary/10" : "border-border hover:border-border/60"} p-3 rounded-lg flex items-center gap-2 cursor-pointer`}
                          onClick={() => handleInputChange("aiImageType", "profile")}
                        >
                          <div className="w-8 h-8 rounded-full bg-[#171A1B] flex items-center justify-center">
                            <ImageIcon className="w-5 h-5 text-primary" />
                          </div>
                          <span>Profile Image</span>
                        </div>
                        <div
                          className={`border-2 ${agentData.aiImageType === "cover" ? "border-primary bg-primary/10" : "border-border hover:border-border/60"} p-3 rounded-lg flex items-center gap-2 cursor-pointer`}
                          onClick={() => handleInputChange("aiImageType", "cover")}
                        >
                          <div className="w-8 h-8 rounded-full bg-[#171A1B] flex items-center justify-center">
                            <ImageIcon className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <span>Cover Image</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Prompt</Label>
                      <Textarea
                        placeholder="Describe the image you want to generate..."
                        className="bg-input border-0 focus-visible:ring-primary min-h-[80px]"
                        value={agentData.aiImagePrompt}
                        onChange={(e) => handleInputChange("aiImagePrompt", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Style</Label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {AVATAR_STYLE_OPTIONS.map((style) => (
                          <Button
                            key={style.value}
                            variant={agentData.aiImageStyle === style.value ? "default" : "outline"}
                            className={`w-full ${agentData.aiImageStyle === style.value ? "" : "hover:bg-primary/20 hover:text-primary"}`}
                            onClick={() => handleInputChange("aiImageStyle", style.value)}
                          >
                            {style.label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {agentData.aiImageType === "profile" && (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-2">
                            <Label>Expression</Label>
                            <Select value={agentData.aiImageExpression} onValueChange={(value) => handleInputChange("aiImageExpression", value)}>
                              <SelectTrigger className="bg-input border-0">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {AVATAR_EXPRESSION_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>Background</Label>
                            <Select value={agentData.aiImageBackground} onValueChange={(value) => handleInputChange("aiImageBackground", value)}>
                              <SelectTrigger className="bg-input border-0">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {AVATAR_BACKGROUND_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>Angle</Label>
                            <Select value={agentData.aiImageAngle} onValueChange={(value) => handleInputChange("aiImageAngle", value)}>
                              <SelectTrigger className="bg-input border-0">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="front-three-quarter">3/4 Front</SelectItem>
                                <SelectItem value="front">Front</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>Gender</Label>
                            <Select value={agentData.aiImageGenderPresentation} onValueChange={(value) => handleInputChange("aiImageGenderPresentation", value)}>
                              <SelectTrigger className="bg-input border-0">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {AVATAR_GENDER_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>Pose</Label>
                            <Select value={agentData.aiImagePose} onValueChange={(value) => handleInputChange("aiImagePose", value)}>
                              <SelectTrigger className="bg-input border-0">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {AVATAR_POSE_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border border-border p-3">
                          <Label className="text-sm">Keep same face on regeneration</Label>
                          <Switch
                            checked={agentData.aiImageLockIdentity}
                            onCheckedChange={(value) => handleInputChange("aiImageLockIdentity", value)}
                            disabled={!agentData.profileImage}
                          />
                        </div>
                      </>
                    )}

                    <Button
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                      onClick={handleGenerateImage}
                      disabled={agentData.isGeneratingImage}
                    >
                      <Sparkles className="w-4 h-4 mr-2" /> Generate Image
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }, [agentData, handleInputChange, handleGenerateImage, isGeneratingDescription, setAgentData, toast])

  const renderCapabilities = useMemo(() => {
    // Filter actions based on search and selected tags
    const filteredActions = allActions.filter((action) => {
      // If no search or tags selected, show all actions
      if (!agentData.searchQuery && agentData.selectedTags.length === 0) {
        return true;
      }
      // Filter by search query
      const matchesSearch =
        !agentData.searchQuery ||
        action.name.toLowerCase().includes(agentData.searchQuery.toLowerCase()) ||
        action.description.toLowerCase().includes(agentData.searchQuery.toLowerCase());

      // Filter by selected tags
      const matchesTags =
        agentData.selectedTags.length === 0 || agentData.selectedTags.some((tag) => action.tags.includes(tag));

      return matchesSearch && matchesTags;
    });

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-2">Agent Capabilities</h2>
          <p className="text-muted-foreground">Define what your AI agent can do for gamers.</p>
        </div>

        <div className="bg-card p-4 rounded-lg mb-6">
          <SearchBar
            value={agentData.searchQuery}
            onChange={(value) => handleInputChange("searchQuery", value)}
            placeholder="Search for an action or filter by tags"
          />

          <TagSelector tags={["Lucid", "Gaming", "Fortnite"]} selectedTags={agentData.selectedTags} onTagToggle={handleTagToggle} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="bg-card border-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <Brain className="w-5 h-5 text-primary mr-2" /> Core Capabilities
              </CardTitle>
              <CardDescription>
                {agentData.searchQuery || agentData.selectedTags.length > 0
                  ? filteredActions.length === 0
                    ? "No actions match your search criteria"
                    : `${filteredActions.length} actions available based on your search`
                  : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="min-h-[300px]">
              <div className="space-y-4 w-full">
                {/* Get selected capabilities */}
                {Object.entries(agentData.capabilities)
                  .filter(([_, enabled]) => enabled)
                  .map(([key]) => {
                    const action = allActions.find(a => a.name.replace(/\s+/g, "") === key);
                    if (!action) return null;
                    return (
                      <CapabilityItem
                        key={action.id}
                        action={action}
                        isEnabled={true}
                        onClick={() => handleCapabilityChange(key, false)}
                        builder={action.builder}
                      />
                    );
                  })}

                {/* Show filtered results if there's an active search/filter */}
                {(agentData.searchQuery || agentData.selectedTags.length > 0) && (
                  <>
                    {/* Only show divider if we have both selected and filtered results */}
                    {Object.entries(agentData.capabilities).some(([_, enabled]) => enabled) && 
                     filteredActions.length > 0 && (
                      <div className="h-px bg-border my-4" />
                    )}
                    
                    {filteredActions.length > 0 ? (
                      filteredActions
                        .filter(action => {
                          const capabilityKey = action.name.replace(/\s+/g, "");
                          return !agentData.capabilities[capabilityKey]; // Only show unselected items
                        })
                        .map((action) => {
                          const capabilityKey = action.name.replace(/\s+/g, "");
                          return (
                            <CapabilityItem
                              key={action.id}
                              action={action}
                              isEnabled={false}
                              onClick={() => handleCapabilityChange(capabilityKey, true)}
                              builder={action.builder}
                            />
                          );
                        })
                    ) : (
                      <div className="flex flex-col items-center justify-center text-muted-foreground py-8">
                        <Search className="w-12 h-12 mb-2 opacity-50" />
                        <p>No actions match your search criteria</p>
                        <p className="text-sm">Try a different search term or tag</p>
                      </div>
                    )}
                  </>
                )}

                {/* Show empty state only if no capabilities are selected and no search/filter is active */}
                {!agentData.searchQuery && 
                 agentData.selectedTags.length === 0 && 
                 !Object.entries(agentData.capabilities).some(([_, enabled]) => enabled) && (
                  <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
                    <Brain className="w-12 h-12 mb-2 opacity-50" />
                    <p>No capabilities selected</p>
                    <p className="text-xs text-center opacity-40 max-w-50">Select capabilities to enable for your agent</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="bg-card border-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <Gamepad className="w-5 h-5 text-primary mr-2" /> Popular Builders
                </CardTitle>
                <CardDescription>Build and customize your agent's capabilities</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(BUILDER_CONFIG).map(([name, config]) => (
                    <div key={name} className="flex items-center gap-3 p-3 rounded-lg bg-secondary">
                      <Image src={config.logo} alt={name} width={32} height={32} className="w-8 h-8 rounded-full" />
                      <div>
                        <h4 className="font-medium">{name}</h4>
                        <p className="text-sm text-muted-foreground">{config.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps -- allActions is recomputed each render
  }, [agentData, handleInputChange, handleCapabilityChange, handleTagToggle])

  const renderModelSettings = useMemo((): React.JSX.Element => {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-2">AI Model Settings</h2>
          <p className="text-muted-foreground">Configure the AI model that powers your agent.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-6">

            <Card className="bg-card border-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <FileText className="w-5 h-5 text-primary mr-2" /> Instructions
                </CardTitle>
                <CardDescription>Provide detailed instructions for your AI agent</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <Textarea
                    placeholder="Enter detailed instructions for how your agent should behave and respond..."
                    value={agentData.instructions}
                    onChange={(e) => handleInputChange("instructions", e.target.value)}
                    className={`bg-input border-0 focus-visible:ring-primary min-h-[150px] transition-colors duration-240 ${
                      isGeneratingInstructions ? 'text-transparent' : 'text-foreground'
                    }`}
                    disabled={isGeneratingInstructions}
                  />
                  {isGeneratingInstructions && <GeneratingLoader word="Instructions" />}
                  {!isGeneratingInstructions && (
                    <Button
                      className="absolute bottom-2 right-2 bg-primary/20 hover:bg-primary/30 text-primary"
                      size="sm"
                      onClick={async () => {
                        try {
                          setIsGeneratingInstructions(true);
                          
                          // Generate instructions based on form context
                          const context = {
                            name: agentData.name || "AI Agent",
                            category: agentData.category || "Gaming",
                            capabilities: Object.entries(agentData.capabilities)
                              .filter(([_, enabled]) => enabled)
                              .map(([key]) => key.replace(/([A-Z])/g, " $1").trim())
                              .join(", "),
                            communicationStyle: agentData.modelSettings.communicationStyle || "balanced",
                          }

                          const prompt = `Create detailed instructions for an AI agent with these characteristics:
                          - Name: ${context.name}
                          - Category: ${context.category}
                          - Capabilities: ${context.capabilities}
                          - Communication Style: ${context.communicationStyle}

                          Write clear instructions (max 300 words) that will guide the AI in:
                          1. How to interact with users
                          2. How to utilize its capabilities effectively
                          3. How to maintain its specified communication style
                          4. What boundaries and limitations to observe

                          Format the instructions in a clear, professional manner.`

                          const response = await fetch(`/api/chat/create?agent_ids=${DEFAULT_AGENT_ID}`, {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({ 
                              message: prompt,
                              maxTokens: 300
                            }),
                          });

                          if (!response.ok) {
                            throw new Error("Failed to generate instructions");
                          }

                          const data = await response.json();
                          
                          if (!data.message) {
                            throw new Error("No instructions generated");
                          }

                          handleInputChange("instructions", data.message);
                          toast.success("AI has generated instructions based on your agent configuration.");
                        } catch {
                          toast.error("Failed to generate instructions. Please try again.");
                        } finally {
                          setIsGeneratingInstructions(false);
                        }
                      }}
                    >
                      <Sparkles className="w-3 h-3 mr-1" /> Generate with AI
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Detailed instructions help your agent understand exactly how to respond to users
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="bg-card border-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <Database className="w-5 h-5 text-primary mr-2" /> Knowledge
                </CardTitle>
                <CardDescription>Upload documents to enhance your agent's knowledge</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-primary/50 transition-colors cursor-pointer">
                  <div className="flex flex-col items-center justify-center py-4">
                    <div className="w-12 h-12 rounded-full bg-[#171A1B] flex items-center justify-center mb-3">
                      <FileUp className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground mb-1">Drag and drop documents here</p>
                    <p className="text-xs text-muted-foreground mb-3">PDF, DOCX, TXT (Max 10MB per file)</p>
                    <Button size="sm" variant="outline" className="border-primary text-primary">
                      <Upload className="w-4 h-4 mr-2" /> Upload Documents
                    </Button>
                  </div>
                </div>

                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Uploaded Documents</h4>
                  {agentData.knowledgeDocuments.length > 0 ? (
                    <div className="space-y-2">
                      {agentData.knowledgeDocuments.map((doc, index) => (
                        <div key={index} className="flex items-center justify-between bg-secondary p-2 rounded-md">
                          <div className="flex items-center">
                            <FileText className="w-4 h-4 text-primary mr-2" />
                            <span className="text-sm">{doc.name}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-red-500"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No documents uploaded yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="bg-card p-4 rounded-lg">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setAgentData({ showAdvanced: !agentData.showAdvanced })}
          >
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              <h3 className="font-medium text-primary">Advanced Settings</h3>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-muted-foreground transition-transform ${
                agentData.showAdvanced ? "rotate-180" : ""
              }`}
            />
          </div>

          {agentData.showAdvanced && (
            <div className="mt-4 space-y-6">
              <Tabs defaultValue="technical" className="w-full">
                <TabsList className="bg-secondary p-1 w-full grid grid-cols-3">
                  <TabsTrigger
                    value="technical"
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    Technical
                  </TabsTrigger>
                  <TabsTrigger
                    value="integration"
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    Integration
                  </TabsTrigger>
                  <TabsTrigger
                    value="privacy"
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    Privacy & Security
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="technical" className="mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="bg-secondary border-0">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center">
                          <FileCode className="w-4 h-4 text-primary mr-2" /> Custom Model Configuration
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label className="text-sm">Use Custom Model</Label>
                            <p className="text-xs text-muted-foreground">Connect your own fine-tuned model</p>
                          </div>
                          <Switch
                            checked={agentData.advancedSettings.useCustomModel}
                            onCheckedChange={(checked) => handleAdvancedSettingChange("useCustomModel", checked)}
                            className="data-[state=checked]:bg-primary"
                          />
                        </div>

                        {agentData.advancedSettings.useCustomModel && (
                          <div className="space-y-2">
                            <Label htmlFor="custom-model-url">Model URL or Endpoint</Label>
                            <Input
                              id="custom-model-url"
                              placeholder="https://your-model-endpoint.com/api"
                              value={agentData.advancedSettings.customModelUrl}
                              onChange={(e) => handleAdvancedSettingChange("customModelUrl", e.target.value)}
                              className="bg-input border-0 focus-visible:ring-primary"
                            />
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="bg-secondary border-0">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center">
                          <Cpu className="w-4 h-4 text-primary mr-2" /> Model Performance
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">Response Speed</Label>
                            <span className="text-xs text-muted-foreground">
                              {agentData.modelSettings.responseSpeed}%
                            </span>
                          </div>
                          <Slider
                            value={[agentData.modelSettings.responseSpeed]}
                            onValueChange={(value) => handleModelSettingChange("responseSpeed", value[0])}
                            max={100}
                            step={1}
                            className="[&>span]:bg-primary"
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">Accuracy</Label>
                            <span className="text-xs text-muted-foreground">{agentData.modelSettings.accuracy}%</span>
                          </div>
                          <Slider
                            value={[agentData.modelSettings.accuracy]}
                            onValueChange={(value) => handleModelSettingChange("accuracy", value[0])}
                            max={100}
                            step={1}
                            className="[&>span]:bg-primary"
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">Creativity</Label>
                            <span className="text-xs text-muted-foreground">{agentData.modelSettings.creativity}%</span>
                          </div>
                          <Slider
                            value={[agentData.modelSettings.creativity]}
                            onValueChange={(value) => handleModelSettingChange("creativity", value[0])}
                            max={100}
                            step={1}
                            className="[&>span]:bg-primary"
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">Complexity</Label>
                            <span className="text-xs text-muted-foreground">{agentData.modelSettings.complexity}%</span>
                          </div>
                          <Slider
                            value={[agentData.modelSettings.complexity]}
                            onValueChange={(value) => handleModelSettingChange("complexity", value[0])}
                            max={100}
                            step={1}
                            className="[&>span]:bg-primary"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="bg-secondary border-0 mt-4">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center">
                        <Cog className="w-4 h-4 text-primary mr-2" /> Performance Settings
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="inference-timeout">Inference Timeout (ms)</Label>
                        <Input
                          id="inference-timeout"
                          type="number"
                          defaultValue="500"
                          className="bg-input border-0 focus-visible:ring-primary"
                        />
                        <p className="text-xs text-muted-foreground">
                          Maximum time allowed for model to generate a response
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-secondary border-0 mt-4">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center">
                        <MessageSquare className="w-4 h-4 text-primary mr-2" /> Communication Style
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          variant={agentData.modelSettings.communicationStyle === "concise" ? "default" : "outline"}
                          className="h-auto py-2 px-3 text-sm"
                          onClick={() => handleModelSettingChange("communicationStyle", "concise")}
                        >
                          <div className="flex flex-col items-center gap-1">
                            <span>Concise</span>
                            <span className="text-xs text-muted-foreground">Brief & Direct</span>
                          </div>
                        </Button>
                        <Button
                          variant={agentData.modelSettings.communicationStyle === "balanced" ? "default" : "outline"}
                          className="h-auto py-2 px-3 text-sm"
                          onClick={() => handleModelSettingChange("communicationStyle", "balanced")}
                        >
                          <div className="flex flex-col items-center gap-1">
                            <span>Balanced</span>
                            <span className="text-xs text-muted-foreground">Mix of Styles</span>
                          </div>
                        </Button>
                        <Button
                          variant={agentData.modelSettings.communicationStyle === "detailed" ? "default" : "outline"}
                          className="h-auto py-2 px-3 text-sm"
                          onClick={() => handleModelSettingChange("communicationStyle", "detailed")}
                        >
                          <div className="flex flex-col items-center gap-1">
                            <span>Detailed</span>
                            <span className="text-xs text-muted-foreground">Comprehensive</span>
                          </div>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-secondary border-0 mt-4">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center">
                        <Layers className="w-4 h-4 text-primary mr-2" /> Model Selection
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          variant="outline"
                          className="h-auto py-2 px-3 text-sm"
                        >
                          <div className="flex flex-col items-center gap-1">
                            <span>Standard</span>
                            <span className="text-xs text-muted-foreground">Balanced</span>
                          </div>
                        </Button>
                        <Button
                          variant="outline"
                          className="h-auto py-2 px-3 text-sm"
                        >
                          <div className="flex flex-col items-center gap-1">
                            <span>Performance</span>
                            <span className="text-xs text-muted-foreground">Fast & Real-time</span>
                          </div>
                        </Button>
                        <Button
                          variant="outline"
                          className="h-auto py-2 px-3 text-sm"
                        >
                          <div className="flex flex-col items-center gap-1">
                            <span>Advanced</span>
                            <span className="text-xs text-muted-foreground">High Accuracy</span>
                          </div>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="privacy" className="mt-4">
                  <Card className="bg-secondary border-0">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center">
                        <Lock className="w-4 h-4 text-primary mr-2" /> Privacy Settings
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Data Privacy Level</Label>
                        <RadioGroup
                          value={agentData.advancedSettings.privacyLevel}
                          onValueChange={(value) => handleAdvancedSettingChange("privacyLevel", value)}
                          className="space-y-3"
                        >
                          <div className="flex items-start space-x-2">
                            <RadioGroupItem
                              value="standard"
                              id="privacy-standard"
                              className="border-primary text-primary mt-1"
                            />
                            <div>
                              <Label htmlFor="privacy-standard" className="text-sm cursor-pointer">
                                Standard
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                Gameplay data is processed in the cloud with standard encryption
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start space-x-2">
                            <RadioGroupItem
                              value="enhanced"
                              id="privacy-enhanced"
                              className="border-primary text-primary mt-1"
                            />
                            <div>
                              <Label htmlFor="privacy-enhanced" className="text-sm cursor-pointer">
                                Enhanced
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                Data is anonymized and encrypted with advanced techniques
                              </p>
                            </div>
                          </div>
                        </RadioGroup>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="integration" className="mt-4">
                  <Card className="bg-secondary border-0">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center">
                        <Code className="w-4 h-4 text-primary mr-2" /> API Integration
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>API Endpoints</Label>
                          <div className="border border-border rounded-md p-2 bg-input">
                            <div className="flex items-center justify-between mb-2">
                              <Input
                                placeholder="https://api.example.com/webhook"
                                className="bg-secondary border-0 focus-visible:ring-primary text-sm h-8"
                              />
                              <Button variant="ghost" size="sm" className="text-primary ml-2 h-8">
                                <Plus className="w-4 h-4" />
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Add endpoints for your agent to connect with external services
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Webhook Secret</Label>
                          <div className="relative">
                            <Input
                              type="password"
                              value="••••••••••••••••"
                              className="bg-input border-0 focus-visible:ring-primary"
                              readOnly
                            />
                            <Button className="absolute right-2 top-1/2 -translate-y-1/2 h-7 text-xs" variant="ghost">
                              Reveal
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Used to verify webhook requests from your agent
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps -- handleInputChange recreated each render
  }, [agentData, handleModelSettingChange, handleAdvancedSettingChange, isGeneratingInstructions])

  const renderPublish = useMemo(() => {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-2">Publish Your AI Agent</h2>
          <p className="text-muted-foreground">Review your agent details and publish to the marketplace.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <Card className="bg-card border-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <Eye className="w-5 h-5 text-primary mr-2" /> Agent Preview
                </CardTitle>
                <CardDescription>This is how your agent will appear in the marketplace</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-secondary rounded-lg overflow-hidden">
                  <div className="relative h-48">
                    <Image
                      src={agentData.coverImage || "https://ik.imagekit.io/g1noocuou2/raijinlabs_cyberpunk_city_full_sky_of_star_a_bog_planet_high_de_0eba6fd2-64ec-48c6-9373-81b26b9d9e5f.png?updatedAt=1740498303499?height=200&width=600"}
                      alt="Agent Preview"
                      fill
                      className="object-cover"
                      unoptimized
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className="bg-purple-500">{agentData.category || "Strategy"}</Badge>
                        {agentData.visibility === "private" && <Badge className="bg-gray-500">Private</Badge>}
                        <div className="flex items-center gap-1">
                          
                          <Badge className="bg-green-900">
                            <Trophy className="w-4 h-4 text-yellow-400" />
                            <span className="text-xs text-white/60">Level 1</span>
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-secondary relative">
                          <Image
                            src={agentData.profileImage || "/logos/icon/avalanche.svg"}
                            alt="Profile"
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                        <div className="flex flex-col">
                          <h1 className="text-xl font-bold">{agentData.name || "StrategyMaster AI"}</h1>
                          <div className="flex items-center gap-4 text-muted-foreground text-sm mt-1">
                            <div className="flex items-center gap-1">
                              <Star className="w-4 h-4 fill-yellow-400 stroke-yellow-400" />
                              <span>New</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {agentData.blockchain === "solana" ? (
                                <div className="w-4 h-4 rounded-full bg-[#9945FF] flex items-center justify-center">
                                  <Image src="/logos/icon/solana.svg" alt="Solana" width={16} height={16} className="w-4 h-4" />
                                </div>
                              ) : (
                                <div className="w-4 h-4 rounded-full bg-[#E84142] flex items-center justify-center">
                                  <Image src="/logos/icon/avalanche.svg" alt="Avalanche" width={16} height={16} className="w-4 h-4" />
                                </div>
                              )}
                              {/* Builder Icons */}
                              {Object.entries(agentData.capabilities)
                                .filter(([_, enabled]) => enabled)
                                .map(([key]) => {
                                  const action = allActions.find(a => a.name.replace(/\s+/g, "") === key);
                                  return action?.builder;
                                })
                                .filter((builder): builder is string => !!builder)
                                .filter((builder, index, self) => self.indexOf(builder) === index) // Remove duplicates
                                .map((builder) => {
                                  const config = BUILDER_CONFIG[builder as keyof typeof BUILDER_CONFIG];
                                  if (!config) return null;
                                  return (
                                    <div key={builder} className="w-4 h-4 rounded-full overflow-hidden">
                                      <Image src={config.logo ?? ''} alt={builder} width={16} height={16} className="w-full h-full object-cover" />
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>

                  <div className="p-4">
                    <p className="text-sm text-muted-foreground">
                      {agentData.description || "No description provided"}
                    </p>

                    {/* Only show capabilities section if user has explicitly enabled some */}
                    {Object.entries(agentData.capabilities).some(([_, enabled]) => enabled) && (
                      <>
                        <h4 className="text-sm font-medium mt-3 mb-2">Capabilities</h4>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(agentData.capabilities)
                            .filter(([_, enabled]) => enabled)
                            .map(([key]) => {
                              const action = allActions.find(a => a.name.replace(/\s+/g, "") === key);
                              const builder = action?.builder;
                              const config = builder ? BUILDER_CONFIG[builder as keyof typeof BUILDER_CONFIG] : null;
                              return (
                                <Badge key={key} variant="outline" className="text-xs border-primary/10 text-muted-foreground flex items-center gap-1 p-1.5 px-3 py-0.5 pl-0.5 rounded-full">
                                  {config && (
                                    <div className="w-4 h-4 rounded-full overflow-hidden">
                                      <Image src={config.logo} alt={builder || ''} width={16} height={16} className="w-full h-full object-cover" />
                                    </div>
                                  )}
                                  {key.replace(/([A-Z])/g, " $1").trim()}
                                </Badge>
                              );
                            })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <Lightbulb className="w-5 h-5 text-primary mr-2" /> Agent Summary
                </CardTitle>
                <CardDescription>Review the key details of your AI agent</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex border-b border-border pb-2">
                    <span className="w-1/3 text-muted-foreground">Name</span>
                    <span className="w-2/3 font-medium">{agentData.name || "StrategyMaster AI"}</span>
                  </div>
                  <div className="flex border-b border-border pb-2">
                    <span className="w-1/3 text-muted-foreground">Category</span>
                    <span className="w-2/3">{agentData.category || "Strategy"}</span>
                  </div>
                  <div className="flex border-b border-border pb-2">
                    <span className="w-1/3 text-muted-foreground">Blockchain</span>
                    <span className="w-2/3 capitalize">{agentData.blockchain || "Solana"}</span>
                  </div>
                  <div className="flex border-b border-border pb-2">
                    <span className="w-1/3 text-muted-foreground">Visibility</span>
                    <span className="w-2/3 capitalize">{agentData.visibility || "Public"}</span>
                  </div>
                  <div className="flex border-b border-border pb-2">
                    <span className="w-1/3 text-muted-foreground">Model Type</span>
                    <span className="w-2/3">Standard AI Model</span>
                  </div>
                  <div className="flex border-b border-border pb-2">
                    <span className="w-1/3 text-muted-foreground">Privacy Level</span>
                    <span className="w-2/3 capitalize">{agentData.advancedSettings.privacyLevel || "Standard"}</span>
                  </div>
                  <div className="flex">
                    <span className="w-1/3 text-muted-foreground">Capabilities</span>
                    <span className="w-2/3">
                      {Object.entries(agentData.capabilities).filter(([_, enabled]) => enabled).length} enabled
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="bg-card border-0 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-purple-500/10 opacity-50" />
              <CardContent className="p-4 relative z-10">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-5 h-5 text-primary" />
                    <h3 className="font-medium">Publishing Information</h3>
                  </div>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                      <p>Your agent will be reviewed before being listed</p>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                      <p>Review process typically takes 24-48 hours</p>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                      <p>Marketplace fee: 10% of sales</p>
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 bg-secondary rounded-lg">
          <div className="flex items-center gap-2">
            <Checkbox
              id="terms-agree"
              checked={termsAgreed}
              onCheckedChange={(checked: boolean) => setTermsAgreed(checked)}
              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
            <Label htmlFor="terms-agree" className="text-sm cursor-pointer">
              I agree to the <span className="text-primary">Terms of Service</span> and{" "}
              <span className="text-primary">Creator Guidelines</span>
            </Label>
          </div>
        </div>
      </div>
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps -- allActions is recomputed each render
  }, [agentData, isPublishing, handlePublish, walletConnected, termsAgreed])

  const ImageDisplay = ({ imageUrl, type }: { imageUrl: string; type: "profile" | "cover" }) => {
    const handleRemove = () => {
      if (type === "profile") {
        setAgentData({
          profileImage: null,
          profileImageAssetId: null,
          profileImageSpec: null,
          profileImagePromptVersion: null,
          profileImageProvider: null,
          profileImageModel: null,
        });
      } else {
        setAgentData({ ...agentData, coverImage: null });
      }
    };

    return (
      <div className="relative group">
        <div className="relative aspect-square rounded-lg overflow-hidden border-2 border-dashed border-border">
          <Image
            src={imageUrl}
            alt={`${type} image`}
            fill
            className="object-cover"
          />
          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-opacity duration-200 flex items-center justify-center">
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <button
                onClick={() => window.open(imageUrl, '_blank')}
                className="p-2 bg-secondary rounded-full hover:bg-secondary/80 transition-colors"
                title="Open in new tab"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
              </button>
              <button
                onClick={handleRemove}
                className="p-2 bg-secondary rounded-full hover:bg-secondary/80 transition-colors"
                title="Remove image"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const progress = useMemo(() => {
    return (agentData.currentStep / totalSteps) * 100;
  }, [agentData.currentStep]);

  const renderStepContent = () => {
    switch (agentData.currentStep) {
      case 1:
        return renderBasicInfo;
      case 2:
        return renderCapabilities;
      case 3:
        return renderModelSettings;
      case 4:
        return renderPublish;
      default:
        return renderBasicInfo;
    }
  };

  // Wait for state to be loaded
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-background text-foreground">
      {/* Top Bar with Progress */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-border">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-primary"
            onClick={() => router.push("/")}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h2 className="text-lg font-medium">Create AI Agent</h2>
        </div>

        {/* Progress bar in top bar */}
        <div className="hidden sm:flex items-center gap-2 flex-1 max-w-md mx-4">
          <div className="h-2 bg-secondary rounded-full w-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-240"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <span className="text-sm text-muted-foreground min-w-[40px] text-right">{agentData.currentStep}/4</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className={`border-border ${previewMode ? "bg-card text-primary" : "text-muted-foreground"}`}
            onClick={() => setPreviewMode(!previewMode)}
          >
            <Eye className="w-4 h-4 mr-2" /> Preview
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex">
        {/* Form Section */}
        <ScrollArea className="flex-1 h-full overflow-hidden">
          <div className="px-3 sm:px-6 py-4 sm:py-6 max-w-3xl mx-auto">
            <div className="relative">
              {/* Mobile progress indicator */}
              <div className="flex sm:hidden items-center gap-2 mb-6">
                <div className="h-2 bg-secondary rounded-full w-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-240"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                <span className="text-sm text-muted-foreground min-w-[40px] text-right">{agentData.currentStep}/4</span>
              </div>

              {renderStepContent()}

              <div className="flex justify-between mt-8">
                <Button
                  variant="outline"
                  className="border-border text-muted-foreground"
                  onClick={handleBack}
                  disabled={agentData.currentStep === 1}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" /> Previous
                </Button>

                {Number(agentData.currentStep) === totalSteps ? (
                  <Button
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    onClick={handlePublish}
                    disabled={
                      isPublishing || 
                      !validateBasicInfo(agentData) || 
                      !validateCapabilities(agentData) || 
                      !validateModelSettings(agentData) ||
                      !termsAgreed
                    }
                  >
                    {isPublishing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Publishing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" /> Publish Agent
                      </>
                    )}
                  </Button>
                ) : (
                  <Button 
                    className="bg-primary hover:bg-primary/90 text-primary-foreground" 
                    onClick={handleNext}
                    disabled={
                      (agentData.currentStep === 1 && !validateBasicInfo(agentData)) ||
                      (agentData.currentStep === 2 && !validateCapabilities(agentData)) ||
                      (agentData.currentStep === 3 && !validateModelSettings(agentData))
                    }
                  >
                    Next <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          <ScrollBar orientation="vertical" />
        </ScrollArea>

        {/* Preview Section */}
        {previewMode && (
          <div className="w-full md:w-1/2 border-l border-border">
            <ScrollArea className="h-full">
              <div className="p-6">
                <div className="bg-card rounded-lg overflow-hidden">
                  {/* Cover Image */}
                  <div className="h-40 bg-secondary relative">
                    {agentData.coverImage ? (
                      <Image
                        src={agentData.coverImage || "/placeholder.svg"}
                        alt="Cover"
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-12 h-12 text-muted-foreground" />
                      </div>
                    )}

                    {/* Blockchain Badge */}
                    <div className="absolute top-3 right-3">
                      <Badge className={`${agentData.blockchain === "solana" ? "bg-[#9945FF]" : "bg-[#E84142]"}`}>
                        {agentData.blockchain === "solana" ? "Solana" : "Avalanche"}
                      </Badge>
                    </div>

                    {/* Visibility Badge */}
                    <div className="absolute top-3 left-3">
                      <Badge className="bg-secondary/80 backdrop-blur-sm">
                        {agentData.visibility === "private" ? "Private" : "Public"}
                      </Badge>
                    </div>
                  </div>

                  {/* Profile and Info */}
                  <div className="px-6 pt-12 pb-6 relative">
                    {/* Profile Image */}
                    <div className="absolute -top-10 left-6">
                      <div className="w-20 h-20 rounded-full border-4 border-card overflow-hidden bg-secondary">
                        {agentData.profileImage ? (
                          <ImageDisplay imageUrl={agentData.profileImage} type="profile" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Brain className="w-8 h-8 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Agent Info */}
                    <div className="ml-24">
                      <h2 className="text-xl font-bold">{agentData.name || "Untitled Agent"}</h2>
                      <p className="text-muted-foreground text-sm mt-1">
                        {agentData.description || "No description provided"}
                      </p>
                    </div>

                    {/* Category */}
                    {agentData.category && (
                      <div className="mt-4">
                        <Badge className="bg-purple-500">
                          {agentData.category.charAt(0).toUpperCase() + agentData.category.slice(1)}
                        </Badge>
                      </div>
                    )}

                    {/* Capabilities */}
                    <div className="mt-6">
                      <h3 className="text-sm font-medium mb-2">Capabilities</h3>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(agentData.capabilities).map(
                          ([key, enabled]) =>
                            enabled && (
                              <Badge key={key} variant="outline" className="border-primary/30 text-primary">
                                {key.replace(/([A-Z])/g, " $1").trim()}
                              </Badge>
                            ),
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <ScrollBar orientation="vertical" />
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  )
}
