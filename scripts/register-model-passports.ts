#!/usr/bin/env tsx
/**
 * Register AI models as Lucid-L2 passports
 * 
 * This script registers commonly-used AI models (OpenAI, Anthropic, Google, etc.)
 * as passports in the Lucid-L2 system, enabling them to be used via the
 * OpenAI-compatible /v1/chat/completions endpoint.
 * 
 * Usage:
 *   npx tsx scripts/register-model-passports.ts
 */

const LUCID_API_BASE = process.env.LUCID_API_BASE_URL || 'https://api.lucid.foundation';

interface ModelPassport {
  name: string;
  provider: string;
  description: string;
  context_length?: number;
  tags?: string[];
}

// Models to register as passports
const MODELS_TO_REGISTER: ModelPassport[] = [
  // OpenAI models
  {
    name: 'openai-gpt35-turbo',
    provider: 'openai',
    description: 'OpenAI GPT-3.5 Turbo - Fast and affordable',
    context_length: 16385,
    tags: ['chat', 'fast', 'affordable']
  },
  {
    name: 'openai-gpt4',
    provider: 'openai',
    description: 'OpenAI GPT-4 - Most capable model',
    context_length: 8192,
    tags: ['chat', 'powerful', 'reasoning']
  },
  {
    name: 'openai-gpt4-turbo',
    provider: 'openai',
    description: 'OpenAI GPT-4 Turbo - Latest GPT-4 with 128k context',
    context_length: 128000,
    tags: ['chat', 'powerful', 'long-context']
  },
  
  // Anthropic models
  {
    name: 'anthropic-claude-3-sonnet',
    provider: 'anthropic',
    description: 'Anthropic Claude 3 Sonnet - Balanced performance',
    context_length: 200000,
    tags: ['chat', 'reasoning', 'long-context']
  },
  {
    name: 'anthropic-claude-3-opus',
    provider: 'anthropic',
    description: 'Anthropic Claude 3 Opus - Most capable Claude',
    context_length: 200000,
    tags: ['chat', 'powerful', 'long-context']
  },
  
  // Google models
  {
    name: 'google-gemini-pro',
    provider: 'google',
    description: 'Google Gemini Pro - Competitive performance',
    context_length: 32760,
    tags: ['chat', 'multimodal']
  },
  
  // Mistral models (via HuggingFace when working)
  {
    name: 'mistralai-mistral-7b',
    provider: 'mistralai',
    description: 'Mistral 7B - Open source, fast',
    context_length: 8192,
    tags: ['chat', 'open-source', 'fast']
  }
];

async function registerModelPassport(model: ModelPassport): Promise<string> {
  console.log(`\n📝 Registering: ${model.name}`);
  
  // Use a placeholder owner address (public key format)
  // In production, this would be your actual Solana wallet
  const OWNER_ADDRESS = process.env.PASSPORT_OWNER || 'system';
  
  const response = await fetch(`${LUCID_API_BASE}/v1/passports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'model',
      name: model.name,
      description: model.description,
      tags: model.tags || [],
      owner: OWNER_ADDRESS,
      metadata: {
        model_name: model.name,
        provider: model.provider,
        format: 'api',
        runtime_recommended: ['api'],
        context_length: model.context_length,
        schema_version: '1.0'
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to register ${model.name}: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  const passportId = result.passport_id || result.data?.passport_id;
  
  console.log(`✅ Registered: ${model.name}`);
  console.log(`   Passport ID: ${passportId}`);
  
  return passportId;
}

async function listExistingPassports(): Promise<void> {
  console.log('\n📋 Checking existing passports...');
  
  try {
    const response = await fetch(`${LUCID_API_BASE}/v1/passports?type=model`, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const result = await response.json();
      const passports = result.passports || result.items || [];
      
      if (passports.length > 0) {
        console.log(`\nFound ${passports.length} existing model passports:`);
        passports.forEach((p: any) => {
          console.log(`  - ${p.name || p.passport_id} (${p.metadata?.provider || 'unknown'})`);
        });
      } else {
        console.log('\nNo existing model passports found.');
      }
    }
  } catch (error) {
    console.warn('Could not list existing passports:', error);
  }
}

async function main() {
  console.log('🚀 Lucid-L2 Model Passport Registration');
  console.log(`📡 API: ${LUCID_API_BASE}`);
  
  // List existing passports
  await listExistingPassports();
  
  console.log(`\n📦 Registering ${MODELS_TO_REGISTER.length} models...`);
  
  const results: { model: string; passportId?: string; error?: string }[] = [];
  
  for (const model of MODELS_TO_REGISTER) {
    try {
      const passportId = await registerModelPassport(model);
      results.push({ model: model.name, passportId });
    } catch (error: any) {
      console.error(`❌ Failed: ${model.name} - ${error.message}`);
      results.push({ model: model.name, error: error.message });
    }
  }
  
  // Summary
  console.log('\n\n📊 Registration Summary:');
  console.log('─'.repeat(60));
  
  const successful = results.filter(r => r.passportId);
  const failed = results.filter(r => r.error);
  
  console.log(`✅ Successful: ${successful.length}/${results.length}`);
  if (failed.length > 0) {
    console.log(`❌ Failed: ${failed.length}/${results.length}`);
    failed.forEach(r => {
      console.log(`   - ${r.model}: ${r.error}`);
    });
  }
  
  if (successful.length > 0) {
    console.log('\n✅ You can now use these models in your worker:');
    console.log('\nIn your assistant settings, set lucid_model to:');
    successful.forEach(r => {
      console.log(`  - "${r.model}"`);
    });
  }
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});