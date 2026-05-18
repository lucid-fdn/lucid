import { useState, useCallback, useEffect } from 'react';
import { localStorageService } from '@/lib/storage/LocalStorageService';
import { performanceMonitor } from '@/lib/monitoring/performance';

const STORAGE_KEY = 'agent-creation-state';

export interface AgentCreationState {
  currentStep: number;
  name: string;
  description: string;
  model: string;
  temperature: number;
  maxTokens: number;
  searchQuery: string;
  selectedTags: string[];
  capabilities: Record<string, boolean>;
  category: string;
  blockchain: string;
  visibility: string;
  profileImage: string | null;
  profileImageAssetId: string | null;
  profileImageSpec: Record<string, unknown> | null;
  profileImagePromptVersion: string | null;
  profileImageProvider: string | null;
  profileImageModel: string | null;
  coverImage: string | null;
  instructions: string;
  modelSettings: {
    responseSpeed: number;
    accuracy: number;
    creativity: number;
    complexity: number;
    communicationStyle: string;
  };
  advancedSettings: {
    useCustomModel: boolean;
    customModelUrl: string;
    privacyLevel: string;
  };
  knowledgeDocuments: Array<{ name: string; url: string }>;
  isGeneratingImage: boolean;
  imageGenerationStatus: string | null;
  imageGenerationProgress: number;
  showAIImageModal: boolean;
  aiImageType: string;
  aiImagePrompt: string;
  aiImageStyle: string;
  aiImageExpression: string;
  aiImageBackground: string;
  aiImageAngle: string;
  aiImageGenderPresentation: string;
  aiImagePose: string;
  aiImageLockIdentity: boolean;
  intermediateImage: string | null;
  activeTab: number;
  showAdvanced: boolean;
  currentGameConfig: string;
  showGameConfigModal: boolean;
  lastUpdated: number;
  version: number;
  formData: Record<string, unknown>;
}

export interface UseAgentCreationStateReturn {
  state: AgentCreationState;
  setState: (state: Partial<AgentCreationState>) => void;
  resetState: () => void;
  isLoading: boolean;
}

const initialState: AgentCreationState = {
  currentStep: 1,
  name: '',
  description: '',
  model: 'gpt-4',
  temperature: 0.7,
  maxTokens: 2000,
  searchQuery: '',
  selectedTags: [],
  capabilities: {},
  category: '',
  blockchain: '',
  visibility: 'public',
  profileImage: null,
  profileImageAssetId: null,
  profileImageSpec: null,
  profileImagePromptVersion: null,
  profileImageProvider: null,
  profileImageModel: null,
  coverImage: null,
  instructions: '',
  modelSettings: {
    responseSpeed: 50,
    accuracy: 50,
    creativity: 50,
    complexity: 50,
    communicationStyle: 'balanced',
  },
  advancedSettings: {
    useCustomModel: false,
    customModelUrl: '',
    privacyLevel: 'standard',
  },
  knowledgeDocuments: [],
  isGeneratingImage: false,
  imageGenerationStatus: null,
  imageGenerationProgress: 0,
  showAIImageModal: false,
  aiImageType: 'profile',
  aiImagePrompt: '',
  aiImageStyle: 'lucid-studio',
  aiImageExpression: 'neutral-friendly',
  aiImageBackground: 'subtle-depth',
  aiImageAngle: 'front-three-quarter',
  aiImageGenderPresentation: 'auto',
  aiImagePose: 'standard-portrait',
  aiImageLockIdentity: true,
  intermediateImage: null,
  activeTab: 0,
  showAdvanced: false,
  currentGameConfig: '',
  showGameConfigModal: false,
  lastUpdated: Date.now(),
  version: 1,
  formData: {},
};

export const useAgentCreationState = (agentId?: string): UseAgentCreationStateReturn => {
  const [state, setState] = useState<AgentCreationState>(() => {
    performanceMonitor.startMetric('agentCreationStateLoad');
    const saved = localStorageService.get<AgentCreationState>(agentId ? `${STORAGE_KEY}-${agentId}` : STORAGE_KEY);
    performanceMonitor.endMetric('agentCreationStateLoad', {
      hasSavedState: !!saved,
      agentId
    });
    return saved || initialState;
  });

  const updateState = useCallback((newState: Partial<AgentCreationState>) => {
    performanceMonitor.startMetric('agentCreationStateUpdate');
    setState(prev => {
      const updated = { ...prev, ...newState, lastUpdated: Date.now() };
      localStorageService.set(agentId ? `${STORAGE_KEY}-${agentId}` : STORAGE_KEY, updated);
      performanceMonitor.endMetric('agentCreationStateUpdate', {
        updatedFields: Object.keys(newState),
        agentId
      });
      return updated;
    });
  }, [agentId]);

  const resetState = useCallback(() => {
    performanceMonitor.startMetric('agentCreationStateReset');
    localStorageService.remove(agentId ? `${STORAGE_KEY}-${agentId}` : STORAGE_KEY);
    setState(initialState);
    performanceMonitor.endMetric('agentCreationStateReset', { agentId });
  }, [agentId]);

  // Save state changes to localStorage
  useEffect(() => {
    performanceMonitor.startMetric('agentCreationStateSave');
    localStorageService.set(agentId ? `${STORAGE_KEY}-${agentId}` : STORAGE_KEY, state);
    performanceMonitor.endMetric('agentCreationStateSave', {
      stateSize: JSON.stringify(state).length,
      agentId
    });
  }, [state, agentId]);

  return {
    state,
    setState: updateState,
    resetState,
    isLoading: false,
  };
};
