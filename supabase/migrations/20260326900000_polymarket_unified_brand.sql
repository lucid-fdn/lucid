-- Unify all Polymarket assets under one branded slug.
-- Fixes: lucid-predict + lucid-predictions → polymarket (plugin)
--        lucid-prediction-trading + lucid-prediction-hedge → polymarket (skill)

-- =============================================================================
-- 1. PLUGIN: Rename lucid-predict → polymarket, merge built-in tools
-- =============================================================================
UPDATE plugin_catalog SET
  slug = 'polymarket',
  name = 'Polymarket',
  description = 'Trade on Polymarket prediction markets. Market search, orderbook analysis, position management, automated stop-loss/take-profit rules, portfolio hedge analysis, and prediction analytics.',
  version = '6.0.0',
  tool_manifest = tool_manifest || '[{"name":"polymarket_trade","description":"Trade on Polymarket (10 actions)"},{"name":"polymarket_automation","description":"Rule-based automation for prediction positions"},{"name":"lucid_hedge","description":"Hedge analysis for prediction positions"}]'::jsonb
WHERE slug = 'lucid-predict';

-- Remove the duplicate lucid-predictions entry if it exists (from old migration)
-- Must cascade: delete activations → installations → catalog entry
DELETE FROM assistant_plugin_activations
WHERE installation_id IN (
  SELECT opi.id FROM org_plugin_installations opi
  JOIN plugin_catalog pc ON pc.id = opi.plugin_id
  WHERE pc.slug = 'lucid-predictions'
);
DELETE FROM org_plugin_installations
WHERE plugin_id IN (SELECT id FROM plugin_catalog WHERE slug = 'lucid-predictions');
DELETE FROM plugin_catalog WHERE slug = 'lucid-predictions';

-- =============================================================================
-- 2. SKILL: Merge two prediction skills into one "polymarket" playbook
-- =============================================================================
INSERT INTO skill_catalog (slug, name, description, raw_content, sanitized_content, frontmatter, source, content_hash, status, content_chars, approved_at)
VALUES (
  'polymarket',
  'Polymarket Trading & Hedge Playbook',
  'Complete Polymarket guide: discovery workflow, orderbook interpretation, order types, position sizing, hedge analysis, automation rules, and risk management.',
  E'# Polymarket Trading & Hedge Playbook\n\n## Discovery → Execution Workflow\n1. search → find markets matching user''s thesis\n2. market_info → check if market is active, accepting orders, min order size\n3. orderbook → assess liquidity before committing capital\n4. buy_yes/buy_no OR split_and_sell → execute based on liquidity assessment\n5. open_orders → verify order status after placement\n\n## Orderbook Interpretation\n- Spread > 0.10 → thin liquidity, use limit orders or split_and_sell\n- Spread < 0.03 → good liquidity, limit orders fill quickly\n- Top-of-book size < order amount → expect partial fills or slippage\n- If orderbook has < 5 levels on either side → illiquid market, warn user\n- Always report spread and top-of-book depth when discussing a market\n\n## Order Type Selection\n- **Limit order (buy_yes/buy_no with limitPrice)**: Default for liquid markets. Set limitPrice at or slightly above best ask (buying) / below best bid (selling). Good for: patient entries, size > $50\n- **FOK / market order (buy_yes/buy_no without limitPrice)**: Fills immediately at best available price. Good for: urgent trades, small amounts (< $25), liquid markets (spread < 0.05)\n- **split_and_sell**: Split USDC into YES+NO tokens via CTF contract, then sell the unwanted side on the orderbook. Good for: thin liquidity (spread > 0.10), guaranteed position entry, large sizes relative to orderbook depth. Cost: gas + sell-side slippage on the unwanted outcome\n\n## Position Sizing\n- Never risk more than the user specifies — do NOT round up or "optimize" amounts\n- If user says "small bet" or "test position" without a specific amount, suggest $5-$10 as a starting point\n- For "go big" or "full conviction" without amount, ask for a specific USD figure — never assume\n- Check minOrderSize from market_info before placing orders\n- The maximum you can lose on a YES/NO position = the amount you paid. There is no leverage.\n\n## Time Decay & Resolution\n- As resolution date approaches, prices converge toward 0 or 1\n- Markets near resolution (< 24h) have wider spreads and lower liquidity\n- Closed markets (closed=true) cannot be traded — inform the user\n- Markets not accepting orders (acceptingOrders=false) are in settlement — no new trades\n\n## Position Tracking\nWhen position tracking is enabled, use get_positions to view current holdings:\n- Shows outcome token balances, average entry price, current price, and P&L\n- Positions are verified against on-chain balances periodically\n- Use this data with lucid_hedge for high-confidence hedge analysis\n\n## Hedge Analysis\n\n### Single Position Analysis\n1. Call lucid_hedge with action "analyze_position" and the conditionId\n2. Review the confidence level and positionSource — if confidence is "low", clearly state that position data is incomplete\n3. Present estimated exposure, hedge cost, and break-even probability\n4. If hedgeAnalysis.recommendation is "hold" or "monitor_only", explain why hedging may not be beneficial\n\n### Portfolio Analysis\n1. Collect known conditionIds from the conversation or user-provided data\n2. Call lucid_hedge with action "analyze_portfolio" and all conditionIds\n3. Present concentration index, directional bias, and relatedness scores\n4. Highlight high-priority recommendations first\n\n### Hedge Execution\n1. ALWAYS call lucid_hedge with action "suggest_hedge" BEFORE recommending any hedge trade\n2. Present ALL hedge options with costs and trade-offs — do not auto-select\n3. If the best strategy is "hold" or "monitor_only", respect that — do not push the user to trade\n4. If the user confirms a hedge, use polymarket_trade to execute — but NEVER auto-execute\n\n### Hedge Rules\n- confidence: "low" means incomplete data — say "estimated known exposure" not "portfolio exposure"\n- NEVER present hedge analysis as definitive — always include the confidence qualifier\n- NEVER auto-execute a hedge trade — always present options and wait for user confirmation\n- Include warnings and assumptions from the response in your reply\n- If positionSource is "open_orders_proxy", remind the user that fully filled positions may not be reflected\n\n## Automation Rules (Protective Alerts)\nWhen automation is enabled, use polymarket_automation to manage rules:\n- stop_loss: triggers when price drops to threshold — "set a stop-loss at 0.30"\n- take_profit: triggers when price rises to threshold — "take profit at 0.85"\n- trailing_stop: tracks highest price and triggers on pullback — "trailing stop at 10%"\n- time_exit: triggers before market close — "exit 24 hours before close"\nAll rules require owner approval before executing. The cron evaluates every 60 seconds.\nUse list_rules to show active rules, list_executions for trigger history.\n\n## Limitations (Be Honest)\n- Automation rules require approval before executing — no fully automated exits yet\n- No real-time P&L streaming — use get_positions or lucid_hedge analyze_position for current exposure\n- Neg-risk markets have special payoff structures — present them as-is from market_info',
  E'# Polymarket Trading & Hedge Playbook\n\n## Discovery → Execution Workflow\n1. search → find markets matching user''s thesis\n2. market_info → check if market is active, accepting orders, min order size\n3. orderbook → assess liquidity before committing capital\n4. buy_yes/buy_no OR split_and_sell → execute based on liquidity assessment\n5. open_orders → verify order status after placement\n\n## Orderbook Interpretation\n- Spread > 0.10 → thin liquidity, use limit orders or split_and_sell\n- Spread < 0.03 → good liquidity, limit orders fill quickly\n- Top-of-book size < order amount → expect partial fills or slippage\n- If orderbook has < 5 levels on either side → illiquid market, warn user\n- Always report spread and top-of-book depth when discussing a market\n\n## Order Type Selection\n- **Limit order (buy_yes/buy_no with limitPrice)**: Default for liquid markets. Set limitPrice at or slightly above best ask (buying) / below best bid (selling). Good for: patient entries, size > $50\n- **FOK / market order (buy_yes/buy_no without limitPrice)**: Fills immediately at best available price. Good for: urgent trades, small amounts (< $25), liquid markets (spread < 0.05)\n- **split_and_sell**: Split USDC into YES+NO tokens via CTF contract, then sell the unwanted side on the orderbook. Good for: thin liquidity (spread > 0.10), guaranteed position entry, large sizes relative to orderbook depth. Cost: gas + sell-side slippage on the unwanted outcome\n\n## Position Sizing\n- Never risk more than the user specifies — do NOT round up or "optimize" amounts\n- If user says "small bet" or "test position" without a specific amount, suggest $5-$10 as a starting point\n- For "go big" or "full conviction" without amount, ask for a specific USD figure — never assume\n- Check minOrderSize from market_info before placing orders\n- The maximum you can lose on a YES/NO position = the amount you paid. There is no leverage.\n\n## Time Decay & Resolution\n- As resolution date approaches, prices converge toward 0 or 1\n- Markets near resolution (< 24h) have wider spreads and lower liquidity\n- Closed markets (closed=true) cannot be traded — inform the user\n- Markets not accepting orders (acceptingOrders=false) are in settlement — no new trades\n\n## Position Tracking\nWhen position tracking is enabled, use get_positions to view current holdings:\n- Shows outcome token balances, average entry price, current price, and P&L\n- Positions are verified against on-chain balances periodically\n- Use this data with lucid_hedge for high-confidence hedge analysis\n\n## Hedge Analysis\n\n### Single Position Analysis\n1. Call lucid_hedge with action "analyze_position" and the conditionId\n2. Review the confidence level and positionSource — if confidence is "low", clearly state that position data is incomplete\n3. Present estimated exposure, hedge cost, and break-even probability\n4. If hedgeAnalysis.recommendation is "hold" or "monitor_only", explain why hedging may not be beneficial\n\n### Portfolio Analysis\n1. Collect known conditionIds from the conversation or user-provided data\n2. Call lucid_hedge with action "analyze_portfolio" and all conditionIds\n3. Present concentration index, directional bias, and relatedness scores\n4. Highlight high-priority recommendations first\n\n### Hedge Execution\n1. ALWAYS call lucid_hedge with action "suggest_hedge" BEFORE recommending any hedge trade\n2. Present ALL hedge options with costs and trade-offs — do not auto-select\n3. If the best strategy is "hold" or "monitor_only", respect that — do not push the user to trade\n4. If the user confirms a hedge, use polymarket_trade to execute — but NEVER auto-execute\n\n### Hedge Rules\n- confidence: "low" means incomplete data — say "estimated known exposure" not "portfolio exposure"\n- NEVER present hedge analysis as definitive — always include the confidence qualifier\n- NEVER auto-execute a hedge trade — always present options and wait for user confirmation\n- Include warnings and assumptions from the response in your reply\n- If positionSource is "open_orders_proxy", remind the user that fully filled positions may not be reflected\n\n## Automation Rules (Protective Alerts)\nWhen automation is enabled, use polymarket_automation to manage rules:\n- stop_loss: triggers when price drops to threshold — "set a stop-loss at 0.30"\n- take_profit: triggers when price rises to threshold — "take profit at 0.85"\n- trailing_stop: tracks highest price and triggers on pullback — "trailing stop at 10%"\n- time_exit: triggers before market close — "exit 24 hours before close"\nAll rules require owner approval before executing. The cron evaluates every 60 seconds.\nUse list_rules to show active rules, list_executions for trigger history.\n\n## Limitations (Be Honest)\n- Automation rules require approval before executing — no fully automated exits yet\n- No real-time P&L streaming — use get_positions or lucid_hedge analyze_position for current exposure\n- Neg-risk markets have special payoff structures — present them as-is from market_info',
  '{"category":"trading","version":"2.0"}'::jsonb, 'manual',
  md5(E'# Polymarket Trading & Hedge Playbook'),
  'approved',
  length(E'# Polymarket Trading & Hedge Playbook\n\n## Discovery → Execution Workflow\n1. search → find markets'),
  now()
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  raw_content = EXCLUDED.raw_content,
  sanitized_content = EXCLUDED.sanitized_content,
  frontmatter = EXCLUDED.frontmatter,
  content_hash = EXCLUDED.content_hash,
  content_chars = EXCLUDED.content_chars,
  status = 'approved',
  approved_at = EXCLUDED.approved_at;

-- Remove old split skill entries
DELETE FROM assistant_skill_activations
WHERE installation_id IN (
  SELECT osi.id FROM org_skill_installations osi
  JOIN skill_catalog sc ON sc.id = osi.skill_id
  WHERE sc.slug IN ('lucid-prediction-trading', 'lucid-prediction-hedge')
);
DELETE FROM org_skill_installations
WHERE skill_id IN (SELECT id FROM skill_catalog WHERE slug IN ('lucid-prediction-trading', 'lucid-prediction-hedge'));
DELETE FROM skill_catalog WHERE slug IN ('lucid-prediction-trading', 'lucid-prediction-hedge');

-- =============================================================================
-- 3. Auto-install + activate for wallet-enabled orgs/assistants
-- =============================================================================

-- Skill
INSERT INTO org_skill_installations (org_id, skill_id)
SELECT DISTINCT aa.org_id, sc.id
FROM ai_assistants aa CROSS JOIN skill_catalog sc
WHERE aa.wallet_enabled = true AND aa.org_id IS NOT NULL AND sc.slug = 'polymarket'
ON CONFLICT (org_id, skill_id) DO NOTHING;

INSERT INTO assistant_skill_activations (assistant_id, installation_id, is_active, sort_order)
SELECT aa.id, osi.id, true, 50
FROM ai_assistants aa
JOIN org_skill_installations osi ON osi.org_id = aa.org_id
JOIN skill_catalog sc ON sc.id = osi.skill_id
WHERE aa.wallet_enabled = true AND sc.slug = 'polymarket'
ON CONFLICT (assistant_id, installation_id) DO NOTHING;

-- Plugin
INSERT INTO org_plugin_installations (org_id, plugin_id, installed_version, config, manifest_snapshot)
SELECT DISTINCT aa.org_id, pc.id, 1, '{}'::jsonb, pc.tool_manifest
FROM ai_assistants aa CROSS JOIN plugin_catalog pc
WHERE aa.wallet_enabled = true AND aa.org_id IS NOT NULL AND pc.slug = 'polymarket'
ON CONFLICT (org_id, plugin_id) DO NOTHING;

INSERT INTO assistant_plugin_activations (assistant_id, installation_id, enabled_tools, is_active)
SELECT aa.id, opi.id,
  ARRAY['lucid_evaluate', 'lucid_discover', 'lucid_arbitrage', 'lucid_correlate', 'lucid_size', 'lucid_calibrate', 'lucid_pro', 'polymarket_trade', 'polymarket_automation', 'lucid_hedge'],
  true
FROM ai_assistants aa
JOIN org_plugin_installations opi ON opi.org_id = aa.org_id
JOIN plugin_catalog pc ON pc.id = opi.plugin_id
WHERE aa.wallet_enabled = true AND pc.slug = 'polymarket'
ON CONFLICT (assistant_id, installation_id) DO NOTHING;
