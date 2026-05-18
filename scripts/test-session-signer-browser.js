/**
 * Browser Console Test Script for Session Signers
 * 
 * Run this in your browser console while logged in to test session signer functionality
 * 
 * Usage:
 * 1. Log in to your app
 * 2. Open browser console (F12)
 * 3. Copy and paste this entire script
 * 4. Run: testSessionSigner('YOUR_WALLET_ADDRESS')
 */

async function testSessionSigner(walletAddress) {
  console.log('🧪 Starting Session Signer Test...')
  console.log('====================================')
  console.log('')
  
  if (!walletAddress) {
    console.error('❌ Please provide a wallet address')
    console.log('Usage: testSessionSigner("0xYOUR_WALLET_ADDRESS")')
    return
  }
  
  try {
    // Test 1: Check Status
    console.log('📋 Test 1: Checking session signer status...')
    const statusResponse = await fetch(`/api/wallet/session-signer/status?address=${walletAddress}`)
    const statusData = await statusResponse.json()
    
    console.log('Response:', statusData)
    
    if (statusData.enabled) {
      console.log('✅ Session signer is ENABLED')
    } else {
      console.log('⚠️  Session signer is NOT ENABLED')
      console.log('')
      console.log('To enable:')
      console.log('1. Go to Settings → Account')
      console.log('2. Scroll to "Autonomous Transactions"')
      console.log('3. Toggle ON')
      console.log('4. Sign the Privy prompt')
      return
    }
    
    console.log('')
    console.log('---')
    console.log('')
    
    // Test 2: Permission Check
    console.log('📋 Test 2: Testing permission check...')
    const testResponse = await fetch('/api/wallet/session-signer/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress })
    })
    const testData = await testResponse.json()
    
    console.log('Response:', testData)
    
    if (testData.success) {
      console.log('✅ Permission check PASSED')
      console.log('   User ID:', testData.test_results.user_id)
      console.log('   Enabled:', testData.test_results.permission_check.enabled)
      console.log('   Session signers:', testData.test_results.user_signers.count)
    } else {
      console.log('❌ Permission check FAILED')
      return
    }
    
    console.log('')
    console.log('---')
    console.log('')
    
    // Test 3: Transaction Signing
    console.log('📋 Test 3: Testing transaction signing...')
    const signResponse = await fetch('/api/wallet/session-signer/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress,
        testTransaction: {
          to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
          value: '0x0',
          data: '0x'
        }
      })
    })
    const signData = await signResponse.json()
    
    console.log('Response:', signData)
    
    if (signData.test_results?.transaction_signing?.success) {
      console.log('✅ Transaction signing PASSED')
      console.log('   Signature:', signData.test_results.transaction_signing.signature_preview)
    } else {
      console.log('❌ Transaction signing FAILED')
      if (signData.test_results?.transaction_signing?.error) {
        console.log('   Error:', signData.test_results.transaction_signing.error)
      }
    }
    
    console.log('')
    console.log('====================================')
    console.log('🎉 Test Complete!')
    console.log('')
    console.log('Check your server console for detailed logs')
    
  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

console.log('✅ Session Signer Test Script Loaded!')
console.log('')
console.log('To test, run:')
console.log('  testSessionSigner("YOUR_WALLET_ADDRESS")')
console.log('')
console.log('To get your wallet address:')
console.log('  1. Click your avatar/wallet in the app')
console.log('  2. Copy the wallet address shown')
console.log('')
