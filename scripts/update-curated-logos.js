/**
 * Update Curated Content with Bundled Logo URLs
 * 
 * Replaces external favicon URLs with our bundled SVG logos
 * Uses color variant when available, otherwise uses icon variant
 */

const fs = require('fs');
const path = require('path');

// Map provider names to bundled logo paths
const LOGO_MAP = {
  // Text Generation - Color available
  'OpenAI / Replicate': '/logos/icon/openai.svg',
  'Claude.ai / OpenRouter': '/logos/icon/anthropic.svg',
  'Google / OpenRouter': '/logos/color/gemini.svg',
  'Groq / Hugging Face': '/logos/icon/groq.svg',
  'Le Chat / Groq': '/logos/color/mistral.svg',
  'x.com / Groq': '/logos/icon/xai.svg',
  'Hugging Face / Together AI': '/logos/color/deepseek.svg',
  'Alibaba Cloud / Hugging Face': '/logos/color/alibaba.svg',
  'OpenRouter': '/logos/icon/openrouter.svg',
  'Hugging Face': '/logos/color/huggingface.svg',
  
  // Image Generation
  'Replicate / Hugging Face': '/logos/color/stability.svg',
  'ChatGPT / Replicate': '/logos/color/dalle.svg',
  'Replicate / Together AI': '/logos/icon/flux.svg',
  'Replicate / OpenRouter': '/logos/icon/ideogram.svg',
  'Google Vertex / Replicate': '/logos/color/google.svg',
  'Playground.com / Replicate': '/logos/icon/replicate.svg',
  'Replicate': '/logos/icon/replicate.svg',
  
  // Video Generation
  'OpenAI': '/logos/icon/openai.svg',
  'Google DeepMind': '/logos/color/deepmind.svg',
  'Runway': '/logos/icon/runway.svg',
  'Luma AI': '/logos/color/luma.svg',
  'Pika Labs': '/logos/icon/pika.svg',
  'Kuaishou (China)': '/logos/color/kling.svg',
  'MiniMax': '/logos/color/hailuo.svg',
  'Shengshu (China)': '/logos/color/vidu.svg',
  'Genmo': '/logos/icon/replicate.svg',
  'Tencent': '/logos/color/tencent.svg',
  
  // Voice & Audio
  'ElevenLabs': '/logos/icon/elevenlabs.svg',
  'Fish Audio': '/logos/icon/fishaudio.svg',
  'PlayHT': '/logos/icon/replicate.svg',
  'Murf': '/logos/icon/replicate.svg',
  'Respeecher': '/logos/icon/replicate.svg',
  'Open Source': '/logos/icon/replicate.svg',
  'Suno AI': '/logos/icon/suno.svg',
  
  // Trading & Finance
  'Hugging Face / Together AI / QuantConnect': '/logos/color/deepseek.svg',
  'Hugging Face / DeepInfra': '/logos/color/huggingface.svg',
  'OpenAI / Replicate / Azure': '/logos/icon/openai.svg',
  'Alpaca Markets': '/logos/icon/replicate.svg', // Alpaca not in LobeHub
  'GitHub / CCXT Exchanges': '/logos/icon/replicate.svg',
  'QuantConnect / IBKR / Alpaca': '/logos/icon/replicate.svg',
  'TrendSpider': '/logos/icon/replicate.svg',
  '3Commas / Binance / Bybit': '/logos/icon/replicate.svg',
  'Trade Ideas / eTrade+': '/logos/icon/replicate.svg',
  'Jesse / Exchange APIs': '/logos/icon/replicate.svg',
  
  // Datasets
  'Stanford / Hugging Face': '/logos/color/huggingface.svg',
  'LAION': '/logos/icon/replicate.svg',
  'Common Crawl Foundation': '/logos/icon/replicate.svg',
  'Together AI': '/logos/color/together.svg',
  'EleutherAI': '/logos/icon/replicate.svg',
  'Microsoft': '/logos/color/microsoft.svg',
  'OpenAI / EleutherAI': '/logos/icon/openai.svg',
  'Salesforce': '/logos/icon/replicate.svg',
  'DeepMind': '/logos/color/deepmind.svg',
  'OpenSLR': '/logos/icon/replicate.svg',
};

// Read curated content file
const filePath = path.join(__dirname, '../src/lib/marketplace/curated-content.ts');
let content = fs.readFileSync(filePath, 'utf8');

console.log('🔄 Updating curated content with bundled logo URLs...\n');

let updatedCount = 0;
let skippedCount = 0;

// Replace each provider's logos
for (const [provider, logoPath] of Object.entries(LOGO_MAP)) {
  const regex = new RegExp(
    `provider: '${provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}',[\\s\\S]*?icon_url: '.*?',\\s*logo_url: '.*?',`,
    'g'
  );
  
  const replacement = `provider: '${provider}',
    description:`;
  
  const beforeMatch = content.match(regex);
  if (beforeMatch) {
    // Update to use bundled logo
    content = content.replace(
      regex,
      (match) => {
        const lines = match.split('\n');
        const updatedLines = lines.map(line => {
          if (line.includes('icon_url:'))  {
            return `    icon_url: '${logoPath}',`;
          }
          if (line.includes('logo_url:')) {
            return `    logo_url: '${logoPath}',`;
          }
          return line;
        });
        updatedCount++;
        console.log(`✅ Updated: ${provider} → ${logoPath}`);
        return updatedLines.join('\n');
      }
    );
  } else {
    skippedCount++;
    console.log(`⚠️  Skipped: ${provider} (not found or already updated)`);
  }
}

// Write updated content
fs.writeFileSync(filePath, content, 'utf8');

console.log('\n══════════════════════════════════════════');
console.log('✨ Logo Update Complete!');
console.log('══════════════════════════════════════════');
console.log(`✅ Updated: ${updatedCount} providers`);
console.log(`⚠️  Skipped: ${skippedCount} providers`);
console.log(`\n📁 File: ${filePath}\n`);
