#!/usr/bin/env tsx
/**
 * Test Lucid-L2 /v1/chat/completions endpoint with existing Llama passport
 */

const LUCID_API_BASE = process.env.LUCID_API_BASE_URL || 'https://api.lucid.foundation';

async function testChatCompletions() {
  console.log('🧪 Testing /v1/chat/completions with existing Llama passport\n');
  
  const testCases = [
    {
      model: 'Llama-3.1-8B-Instruct',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say hello in one sentence.' }
      ]
    }
  ];

  for (const testCase of testCases) {
    console.log(`📝 Testing model: ${testCase.model}`);
    console.log(`📨 Request:`, JSON.stringify(testCase, null, 2));
    
    try {
      const response = await fetch(`${LUCID_API_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: testCase.model,
          messages: testCase.messages,
          max_tokens: 100,
          temperature: 0.7
        })
      });

      console.log(`📊 Status: ${response.status} ${response.statusText}\n`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Error Response:`, errorText);
        continue;
      }

      const data = await response.json();
      console.log(`✅ Success!`);
      console.log(`📦 Response:`, JSON.stringify(data, null, 2));
      
      const assistantMessage = data.choices?.[0]?.message?.content;
      if (assistantMessage) {
        console.log(`\n💬 Assistant: "${assistantMessage}"\n`);
      }
      
      if (data.usage) {
        console.log(`📊 Usage:`, data.usage);
      }
      
      console.log(`\n${'─'.repeat(60)}\n`);
      
    } catch (error: any) {
      console.error(`❌ Request failed:`, error.message);
    }
  }
}

testChatCompletions().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});