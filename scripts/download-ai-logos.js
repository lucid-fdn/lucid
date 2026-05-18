/**
 * Download AI Provider Logos from LobeHub (SVG)
 * 
 * Downloads SVG logo variants from LobeHub CDN:
 * - {provider}.svg - Icon only
 * - {provider}-text.svg - Full logo with icon + text
 * - {provider}-color.svg - Colored version
 * 
 * Based on: https://lobehub.com/icons
 * CDN: https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@latest/icons/
 * 
 * Run: node scripts/download-ai-logos.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ALL AI providers from explore page
const PROVIDERS = [
  // Text Generation
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'google', name: 'Google' },
  { id: 'gemini', name: 'Gemini' },
  { id: 'deepmind', name: 'Google DeepMind' },
  { id: 'meta', name: 'Meta' },
  { id: 'mistral', name: 'Mistral' },
  { id: 'cohere', name: 'Cohere' },
  { id: 'perplexity', name: 'Perplexity' },
  { id: 'xai', name: 'xAI' },
  { id: 'groq', name: 'Groq' },
  { id: 'together', name: 'Together AI' },
  { id: 'deepseek', name: 'DeepSeek' },
  { id: 'alibaba', name: 'Alibaba' },
  { id: 'qwen', name: 'Qwen' },
  { id: 'microsoft', name: 'Microsoft' },
  
  // Image Generation
  { id: 'stability', name: 'Stability AI' },
  { id: 'dalle', name: 'DALL-E' },
  { id: 'midjourney', name: 'Midjourney' },
  { id: 'runway', name: 'Runway' },
  { id: 'ideogram', name: 'Ideogram' },
  { id: 'recraft', name: 'Recraft' },
  { id: 'flux', name: 'Flux' },
  { id: 'bfl', name: 'Black Forest Labs' },
  { id: 'playground', name: 'Playground AI' },
  
  // Video Generation
  { id: 'luma', name: 'Luma AI' },
  { id: 'pika', name: 'Pika Labs' },
  { id: 'tencent', name: 'Tencent' },
  { id: 'sora', name: 'Sora' },
  { id: 'kling', name: 'Kling' },
  { id: 'hailuo', name: 'Hailuo' },
  { id: 'vidu', name: 'Vidu' },
  
  // Voice/Audio
  { id: 'elevenlabs', name: 'ElevenLabs' },
  { id: 'fishaudio', name: 'Fish Audio' },
  { id: 'suno', name: 'Suno AI' },
  { id: 'murf', name: 'Murf AI' },
  
  // Platforms
  { id: 'replicate', name: 'Replicate' },
  { id: 'huggingface', name: 'Hugging Face' },
  { id: 'openrouter', name: 'OpenRouter' },
];

// Logo variants available in LobeHub
const LOGO_VARIANTS = [
  {
    name: 'icon',
    filename: (id) => `${id}.svg`,
    outputDir: 'icon',
    desc: 'Icon only'
  },
  {
    name: 'text',
    filename: (id) => `${id}-text.svg`,
    outputDir: 'text',
    desc: 'Full logo with icon + text'
  },
  {
    name: 'color',
    filename: (id) => `${id}-color.svg`,
    outputDir: 'color',
    desc: 'Colored version'
  },
];

const LOBEHUB_BASE = 'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@latest/icons';
const OUTPUT_DIR = path.join(__dirname, '../public/logos');

// Create output directories
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

LOGO_VARIANTS.forEach(variant => {
  const dir = path.join(OUTPUT_DIR, variant.outputDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

function downloadLogo(provider, variant) {
  return new Promise((resolve) => {
    const filename = variant.filename(provider.id);
    const url = `${LOBEHUB_BASE}/${filename}`;
    const filepath = path.join(OUTPUT_DIR, variant.outputDir, `${provider.id}.svg`);
    
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        const file = fs.createWriteStream(filepath);
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`  ✅ ${variant.name.padEnd(8)} ${provider.id}.svg`);
          resolve(true);
        });
      } else if (response.statusCode === 404) {
        console.log(`  ⚠️  ${variant.name.padEnd(8)} Not available`);
        resolve(false);
      } else {
        console.log(`  ❌ ${variant.name.padEnd(8)} Error (${response.statusCode})`);
        resolve(false);
      }
    }).on('error', (err) => {
      console.log(`  ❌ ${variant.name.padEnd(8)} Network error`);
      resolve(false);
    });
  });
}

async function downloadAllVariants(provider) {
  console.log(`\n📥 ${provider.name}`);
  
  const results = await Promise.all(
    LOGO_VARIANTS.map(variant => downloadLogo(provider, variant))
  );
  
  const successCount = results.filter(r => r).length;
  if (successCount === 0) {
    console.log(`   ❌ No variants found`);
  } else if (successCount === LOGO_VARIANTS.length) {
    console.log(`   ✨ All ${LOGO_VARIANTS.length} variants downloaded!`);
  } else {
    console.log(`   ℹ️  ${successCount}/${LOGO_VARIANTS.length} variants available`);
  }
  
  return successCount;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🚀 LobeHub SVG Logo Downloader');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`📦 Providers: ${PROVIDERS.length}`);
  console.log(`🎨 Format: SVG (scalable vector graphics)`);
  console.log(`📋 Variants:`);
  LOGO_VARIANTS.forEach(v => {
    console.log(`   - ${v.name}: ${v.desc}`);
  });
  console.log('\nStarting download...\n');
  
  let totalLogos = 0;
  let providersWithAll = 0;
  
  for (const provider of PROVIDERS) {
    const count = await downloadAllVariants(provider);
    totalLogos += count;
    if (count === LOGO_VARIANTS.length) {
      providersWithAll++;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✨ Download Complete!');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`📊 Statistics:`);
  console.log(`   Total logos downloaded: ${totalLogos}`);
  console.log(`   Providers with ALL variants: ${providersWithAll}/${PROVIDERS.length}`);
  console.log(`\n📁 Output: ${OUTPUT_DIR}\n`);
  console.log('Directory structure:');
  console.log(`  logos/`);
  console.log(`    ├── icon/     # Icon only`);
  console.log(`    ├── text/     # Full logo with text`);
  console.log(`    └── color/    # Colored version`);
  console.log(`\nUsage:`);
  console.log(`  Icon only:    /logos/icon/openai.svg`);
  console.log(`  Full logo:    /logos/text/openai.svg  ← Icon + Text!`);
  console.log(`  Colored:      /logos/color/openai.svg`);
}

main().catch(console.error);
