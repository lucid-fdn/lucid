#!/bin/bash

# Session Signers Quick Test Script
# Tests the session signer implementation

set -e

echo "🧪 Session Signers Test Suite"
echo "=============================="
echo ""

# Check if wallet address provided
if [ -z "$1" ]; then
  echo "❌ Error: Wallet address required"
  echo ""
  echo "Usage: ./scripts/test-session-signers.sh YOUR_WALLET_ADDRESS"
  echo ""
  echo "Example:"
  echo "  ./scripts/test-session-signers.sh 0x1234567890abcdef1234567890abcdef12345678"
  echo ""
  exit 1
fi

WALLET_ADDRESS=$1
BASE_URL=${BASE_URL:-http://localhost:3000}

echo "Wallet: $WALLET_ADDRESS"
echo "Base URL: $BASE_URL"
echo ""

# Test 1: Check Status
echo "📋 Test 1: Checking session signer status..."
echo "GET $BASE_URL/api/wallet/session-signer/status?address=$WALLET_ADDRESS"
echo ""

STATUS_RESPONSE=$(curl -s "$BASE_URL/api/wallet/session-signer/status?address=$WALLET_ADDRESS")
echo "$STATUS_RESPONSE" | jq '.' 2>/dev/null || echo "$STATUS_RESPONSE"
echo ""

IS_ENABLED=$(echo "$STATUS_RESPONSE" | jq -r '.enabled' 2>/dev/null)

if [ "$IS_ENABLED" = "true" ]; then
  echo "✅ Status check passed - Session signer is enabled"
else
  echo "⚠️  Session signer not enabled"
  echo "   Please enable it via: Settings → Account → Autonomous Transactions"
  echo ""
  echo "   Would you like instructions? (y/n)"
  read -r response
  if [ "$response" = "y" ]; then
    echo ""
    echo "   Steps to enable:"
    echo "   1. Log in to your app at $BASE_URL"
    echo "   2. Go to Settings → Account"
    echo "   3. Scroll to 'Autonomous Transactions'"
    echo "   4. Toggle ON for wallet $WALLET_ADDRESS"
    echo "   5. Sign the Privy prompt when it appears"
    echo ""
  fi
  exit 1
fi

echo ""
echo "---"
echo ""

# Test 2: Permission Check
echo "📋 Test 2: Testing permission check..."
echo "POST $BASE_URL/api/wallet/session-signer/test"
echo ""

TEST_RESPONSE=$(curl -s -X POST "$BASE_URL/api/wallet/session-signer/test" \
  -H "Content-Type: application/json" \
  -d "{\"walletAddress\":\"$WALLET_ADDRESS\"}")

echo "$TEST_RESPONSE" | jq '.' 2>/dev/null || echo "$TEST_RESPONSE"
echo ""

TEST_SUCCESS=$(echo "$TEST_RESPONSE" | jq -r '.success' 2>/dev/null)

if [ "$TEST_SUCCESS" = "true" ]; then
  echo "✅ Permission check passed"
else
  echo "❌ Permission check failed"
  exit 1
fi

echo ""
echo "---"
echo ""

# Test 3: Transaction Signing
echo "📋 Test 3: Testing transaction signing..."
echo "POST $BASE_URL/api/wallet/session-signer/test (with transaction)"
echo ""

TX_TEST_RESPONSE=$(curl -s -X POST "$BASE_URL/api/wallet/session-signer/test" \
  -H "Content-Type: application/json" \
  -d "{
    \"walletAddress\":\"$WALLET_ADDRESS\",
    \"testTransaction\": {
      \"to\": \"0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb\",
      \"value\": \"0x0\",
      \"data\": \"0x\"
    }
  }")

echo "$TX_TEST_RESPONSE" | jq '.' 2>/dev/null || echo "$TX_TEST_RESPONSE"
echo ""

TX_SUCCESS=$(echo "$TX_TEST_RESPONSE" | jq -r '.test_results.transaction_signing.success' 2>/dev/null)

if [ "$TX_SUCCESS" = "true" ]; then
  echo "✅ Transaction signing passed"
  
  # Show signature preview
  SIGNATURE=$(echo "$TX_TEST_RESPONSE" | jq -r '.test_results.transaction_signing.signature_preview' 2>/dev/null)
  echo "   Signed transaction: $SIGNATURE"
else
  echo "❌ Transaction signing failed"
  ERROR=$(echo "$TX_TEST_RESPONSE" | jq -r '.test_results.transaction_signing.error' 2>/dev/null)
  echo "   Error: $ERROR"
  exit 1
fi

echo ""
echo "=============================="
echo "🎉 All tests passed!"
echo ""
echo "Your session signer implementation is working correctly!"
echo ""
echo "Next steps:"
echo "  1. Check server logs for detailed execution traces"
echo "  2. Test revocation (toggle OFF in Settings → Account)"
echo "  3. Use in your trading bot/agent code"
echo ""
echo "For detailed testing guide, see:"
echo "  docs/SESSION_SIGNERS_TESTING_GUIDE.md"
echo ""
