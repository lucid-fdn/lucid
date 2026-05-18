export const carrefourStagingFixture = {
  accountMetadata: {
    carrefour_domain: 'carrefour.fr',
  },
  cartHtml: `
    <main>
      <h1>Mon panier</h1>
      <p>2 articles</p>
      <p>Sous-total: 25,98 €</p>
      <p>Total estimé: 25,98 €</p>
      <p>Créneau: livraison mardi 12 mai 10h-12h</p>
    </main>
  `,
  checkoutHtml: `
    <main>
      <h1>Validation de la commande</h1>
      <p>2 articles</p>
      <p>Total à payer: 25,98 €</p>
      <p>Créneau: livraison mardi 12 mai 10h-12h</p>
      <button>Confirmer la commande</button>
    </main>
  `,
  confirmationHtml: `
    <main>
      <h1>Votre commande est confirmée</h1>
      <p>Commande n° CRF-ABC-123456</p>
      <p>Total payé: 25,98 €</p>
      <p>Créneau: livraison mardi 12 mai 10h-12h</p>
    </main>
  `,
  receiptHtml: `
    <main>
      <h1>Détail de la commande</h1>
      <p>Commande n° CRF-ABC-123456</p>
      <p>Total de la commande: 25,98 €</p>
      <p>Créneau: livraison mardi 12 mai 10h-12h</p>
    </main>
  `,
  expiredSessionHtml: `
    <main>
      <h1>Connexion requise</h1>
      <p>Votre session a expiré.</p>
    </main>
  `,
  captchaHtml: `
    <main>
      <h1>Vérification</h1>
      <p>Vérifiez que vous êtes humain.</p>
    </main>
  `,
  mfaHtml: `
    <main>
      <h1>Authentification bancaire</h1>
      <p>Code de sécurité requis pour finaliser le paiement.</p>
    </main>
  `,
  paymentFailureHtml: `
    <main>
      <h1>Paiement refusé</h1>
      <p>Validation bancaire impossible.</p>
    </main>
  `,
} as const
