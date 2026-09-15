import type { Logger, YubaCheckInConfig } from './types'
import { executeFollowedYubaCheckInWithDyToken, formatYubaModeLabel } from './yuba'

export async function executeYubaCheckInJob(config: YubaCheckInConfig, yubaCookie: string, mainCookie: string, log: Logger): Promise<void> {
  const mode = config.mode || 'followed'
  log(`开始执行鱼吧签到任务，模式: ${formatYubaModeLabel(mode)}`)

  if (mode !== 'followed') {
    throw new Error(`暂不支持的鱼吧签到模式: ${mode}`)
  }

  const result = await executeFollowedYubaCheckInWithDyToken(yubaCookie, mainCookie, log)
  if (result.failedCount > 0 || result.stoppedEarly) {
    // Do not propagate credential text: replaying the whole task can repeat supplementary sign-ins.
    throw new Error(`鱼吧任务执行不完整: 成功 ${result.signedCount}，已签到 ${result.alreadySignedCount}，失败 ${result.failedCount}${result.stoppedEarly ? '，提前停止' : ''}`)
  }
}
