import 'server-only'

import type { EvalReceipt } from '@contracts/eval-receipts'
import { recordEvalReceipt } from '@/lib/db/eval-receipts'
import {
  defaultHeuristicEvalJudgeProviders,
  runCrossProviderEval,
  type CrossProviderEvalResult,
  type RunCrossProviderEvalInput,
} from './cross-provider'

export interface RunAndRecordEvalReceiptInput extends Omit<RunCrossProviderEvalInput, 'providers'> {
  providers?: RunCrossProviderEvalInput['providers']
}

export interface RunAndRecordEvalReceiptResult {
  receipt: EvalReceipt
  evaluation: CrossProviderEvalResult
}

export async function runAndRecordEvalReceipt(
  input: RunAndRecordEvalReceiptInput,
): Promise<RunAndRecordEvalReceiptResult> {
  const evaluation = await runCrossProviderEval({
    ...input,
    providers: input.providers && input.providers.length > 0
      ? input.providers
      : defaultHeuristicEvalJudgeProviders(),
  })
  const receipt = await recordEvalReceipt(evaluation.receiptInput)
  return { receipt, evaluation }
}
