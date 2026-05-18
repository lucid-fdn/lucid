export const shopifyStagingFixture = {
  accountMetadata: {
    shopify_domains: ['weekly-market.example'],
  },
  cartJson: {
    token: 'fixture-redacted-token',
    currency: 'EUR',
    item_count: 2,
    total_price: 2598,
    original_total_price: 2998,
    total_discount: 400,
    items: [{
      id: 123,
      product_id: 456,
      variant_id: 789,
      product_title: 'Olive oil',
      quantity: 2,
      price: 1299,
      final_line_price: 2598,
      vendor: 'Local Grocer',
      product_type: 'Pantry',
    }],
  },
  checkoutHtml: `
    <main>
      <h1>Checkout</h1>
      <p>Olive oil quantity 2</p>
      <p>Total: EUR 25.98</p>
      <button>Review order</button>
    </main>
  `,
  confirmationHtml: `
    <main>
      <h1>Thank you Quentin</h1>
      <p>Order #1042</p>
      <p>Confirmation number: SHOP-ABC-42</p>
      <p>Total: €25.98</p>
    </main>
  `,
  receiptHtml: `
    <main>
      <h1>Order status</h1>
      <p>Order #1042</p>
      <p>Confirmation number: SHOP-ABC-42</p>
      <p>Total: €25.98</p>
    </main>
  `,
  expiredSessionHtml: `
    <main>
      <h1>Sign in</h1>
      <p>Your session expired. Please sign in again.</p>
    </main>
  `,
  captchaHtml: `
    <main>
      <h1>Security check</h1>
      <p>Confirm you are not a robot before continuing.</p>
    </main>
  `,
  mfaHtml: `
    <main>
      <h1>Verification required</h1>
      <p>Enter the one-time code sent to your phone.</p>
    </main>
  `,
  paymentFailureHtml: `
    <main>
      <h1>Payment could not be completed</h1>
      <p>Please update your payment method.</p>
    </main>
  `,
} as const
