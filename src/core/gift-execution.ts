import { AsyncLocalStorage } from 'node:async_hooks'

const execution = new AsyncLocalStorage<{ mutationAttempted: boolean }>()
const nonReplayableErrors = new WeakSet<object>()

export function markGiftMutationAttempted(): void {
  const state = execution.getStore()
  if (state) {
    state.mutationAttempted = true
  }
}

export function isGiftTaskReplayUnsafe(error: unknown): boolean {
  return error instanceof Error && nonReplayableErrors.has(error)
}

export async function runGiftExecution<T>(run: () => Promise<T>): Promise<T> {
  const state = { mutationAttempted: false }
  return execution.run(state, async () => {
    try {
      return await run()
    } catch (error: unknown) {
      if (!state.mutationAttempted) {
        throw error
      }
      // A failed response may follow a successful remote mutation; never replay the task.
      const failure = error instanceof Error ? error : new Error(String(error))
      nonReplayableErrors.add(failure)
      throw failure
    }
  })
}
