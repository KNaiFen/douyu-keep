import { getBackpackStatus, getDid, getGiftNumber, parseDyAndSidFromCookie, sendGift, sleep } from './api'
import { errorMessage } from './errors'
import { markGiftMutationAttempted } from './gift-execution'
import type { BackpackStatus, GiftSendJobs, Logger, SendGiftRequestArgs } from './types'

export type RoomDidResolver = (roomId: number) => Promise<string>

export function createRoomDidResolver(cookie: string): RoomDidResolver {
  const didByRoom = new Map<number, string>()
  return async (roomId) => {
    const cached = didByRoom.get(roomId)
    if (cached !== undefined) {
      return cached
    }
    const did = await getDid(String(roomId), cookie)
    didByRoom.set(roomId, did)
    return did
  }
}

export async function loadGiftNumber(options: {
  cookie: string
  log: Logger
  prefix?: string
  candidateRoomIds?: number[]
}): Promise<number | null> {
  const { cookie, log, prefix, candidateRoomIds = [] } = options
  if (prefix) {
    log(prefix)
  }

  let number = 0
  try {
    number = await getGiftNumber(cookie, candidateRoomIds)
  } catch (error) {
    log(`获取荧光棒数量失败: ${errorMessage(error)}`)
    throw error
  }
  if (number === 0) {
    log('荧光棒数量为0, 结束任务')
  } else {
    log(`荧光棒数量为${number}`)
  }
  return number
}

export async function loadBackpackStatus(options: {
  cookie: string
  log: Logger
  prefix?: string
  candidateRoomIds?: number[]
}): Promise<BackpackStatus | null> {
  const { cookie, log, prefix, candidateRoomIds = [] } = options
  if (prefix) {
    log(prefix)
  }
  try {
    const status = await getBackpackStatus(cookie, candidateRoomIds)
    log(`背包可见礼物行数: ${status.totalRows}，荧光棒数量: ${status.glowStickCount}`)
    return status
  } catch (error) {
    log(`获取背包明细失败: ${errorMessage(error)}`)
    throw error
  }
}

export function formatShanghaiTime(value: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value)).replace(/\//g, '-')
}

export async function sendGifts(options: {
  jobs: GiftSendJobs
  cookie: string
  log: Logger
  giftLabel?: string
  completionLabel?: string
  resolveDid?: RoomDidResolver
}): Promise<void> {
  const {
    jobs,
    cookie,
    log,
    giftLabel = '荧光棒',
    completionLabel = '任务',
    resolveDid: providedResolveDid,
  } = options
  let args: SendGiftRequestArgs
  try {
    args = parseDyAndSidFromCookie(cookie)
  } catch (error: unknown) {
    log(`获取参数失败: ${errorMessage(error)}`)
    throw error
  }

  let failedNumber = 0
  let lastFailure: unknown
  const resolveDid = providedResolveDid || createRoomDidResolver(cookie)
  const sendJobs = Object.values(jobs).filter(item => item.count !== 0)
  for (const [index, item] of sendJobs.entries()) {
    try {
      log(`即将赠送${item.roomId}房间${item.count + failedNumber}个${giftLabel}`)
      const did = await resolveDid(item.roomId)
      args.did = did
      const attempt = { ...item, count: item.count + failedNumber }
      markGiftMutationAttempted()
      await sendGift(args, attempt, cookie)
      failedNumber = 0
      log(`赠送${item.roomId}房间${attempt.count}个${giftLabel}成功`)
    } catch (error) {
      failedNumber += item.count
      lastFailure = error
      log(`${item.roomId}房间赠送失败: ${errorMessage(error)}, ${failedNumber}个${giftLabel}${index < sendJobs.length - 1 ? '自动移交给下一个房间' : '未赠送成功'}`)
    }
    if (index < sendJobs.length - 1) {
      await sleep(2000)
    }
  }

  if (failedNumber > 0) {
    log(`${completionLabel}执行完毕, 有${failedNumber}个${giftLabel}未赠送成功`)
    throw new Error(`${completionLabel}未完成，有${failedNumber}个${giftLabel}未赠送成功: ${errorMessage(lastFailure)}`)
  } else {
    log(`${completionLabel}执行完毕`)
  }
}
