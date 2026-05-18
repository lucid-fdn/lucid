-- ============================================================================
-- Migration 080: Seed additional DEX routers + enable trading kill switch
-- ============================================================================

-- ============================================================================
-- 1. Additional known protocol routers
-- ============================================================================

INSERT INTO known_protocol_routers (chain_id, protocol, router_address) VALUES
  -- Uniswap Universal Router (current default for Uniswap frontend)
  ('1',     'uniswap_universal', '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD'),
  ('8453',  'uniswap_universal', '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD'),
  ('42161', 'uniswap_universal', '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD'),

  -- 0x Exchange Proxy (powers Matcha, Coinbase Wallet, MetaMask swaps)
  ('1',     '0x',                '0xDef1C0ded9bec7F1a1670819833240f027b25EfF'),
  ('8453',  '0x',                '0xDef1C0ded9bec7F1a1670819833240f027b25EfF'),
  ('42161', '0x',                '0xDef1C0ded9bec7F1a1670819833240f027b25EfF'),

  -- Paraswap Augustus Swapper V6.2
  ('1',     'paraswap',          '0x6A000F20005980200259B80c5102003040001068'),
  ('8453',  'paraswap',          '0x6A000F20005980200259B80c5102003040001068'),
  ('42161', 'paraswap',          '0x6A000F20005980200259B80c5102003040001068'),

  -- Uniswap V2 Router (still heavily used)
  ('1',     'uniswap_v2',        '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 2. Enable global trading kill switch
-- ============================================================================

UPDATE system_config
SET value = 'true'::jsonb,
    updated_at = now()
WHERE key = 'trading_global_enabled';
