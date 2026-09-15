# douyu-keep 与 douyu-keep-just-works 详细对比

分析日期：2026-09-15。本文依据本地两份仓库的 Git 历史、当前源码、配置、测试及发布工作流。

## 1. 结论

原版是一个在个人电脑上运行的 Electron 桌面荧光棒赠送工具；fork 已经演进成面向 NAS、家庭服务器和 Docker 的斗鱼粉丝牌管理服务。

fork 最重要的新增能力是：独立的双倍亲密度赠送任务、临期礼物处理、鱼吧签到、浏览器管理后台、Passport 扫码登录、CookieCloud 同步和登录态恢复。它也重新组织了领取、保活、配置、状态缓存及发布流程。

它并不是完整保留原版桌面体验后增加几项功能：2026-04-25 的 `6702f65` 已删除 Electron 主进程、桌面前端和桌面打包链。托盘、桌面开机自启、任务完成后关闭程序等原版交互，不属于当前 fork 的维护范围。

fork 的工程组织和错误处理明显更完整，但不能据此认为所有异常已修复。当前代码仍有连续失败转赠重复累计、部分任务失败仅记日志、不同行为任务共享库存却没有统一互斥等问题。后文区分已实现的改进、行为限制与已复现的问题。

## 2. 比较基准与 Git 关系

| 项目 | 原版 | fork |
| --- | --- | --- |
| 仓库 | Curtion/douyu-keep | tophtab/douyu-keep-just-works |
| 本地路径 | `E:/Downloads/Code/douyu-keep` | `E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works` |
| 分析所用 HEAD | `d3bb0b6` | `b9f6f52` |
| HEAD 日期 | 2025-12-24 | 2026-09-05 |
| package.json 版本 | 1.1.0 | 3.10.0 |
| 可达提交数 | 56 | 736 |
| fork 相对原版 | 基准 | 领先 680 个提交，落后 0 个 |
| src 跟踪文件数，含资源 | 30 | 120 |
| src 文本源码规模，近似 | 1,650 行 | 14,215 行 |
| 当前专门的测试文件 | 未发现测试套件 | 9 个 `*.test.js`，另有测试辅助模块 |

`git merge-base d3bb0b6 HEAD` 在 fork 中返回原版的 `d3bb0b65b4f97d4e56bbbeb457fc4c3bb73e9456`。因此，当前本地原版的全部历史都在 fork 中，可以直接比较 `d3bb0b6..b9f6f52`，不需要猜测分叉点。

统计 `src`、`test`、`scripts`、`.github`、`Dockerfile`、`docker-compose.yml`、`package.json`、`packaging`，共 191 个文件变化，增加 17,423 行、删除 1,945 行。这不包含锁文件和大量 Trellis 文档，能更接近产品和工程实现的改动规模。源码行数按 TS、Vue、JS、HTML、CSS、SCSS 文本统计，是规模指标，不是复杂度或质量评分。

680 个新增提交中，222 个触及上述运行代码、测试、构建或打包路径。大量其余提交是工作日志、任务归档、开发规范、README、图片及工具升级，不能把 680 个提交理解成 680 项功能。

原版初次检查出现许多已跟踪文件改动，忽略行末空白后差异为空；后续状态中只剩原有 `.codegraph/` 和 `.materials/` 未跟踪目录。本次没有修改这些文件。fork 检查时工作区干净。本文代码结论针对上述两个提交，而不是未来远端版本；没有执行远端 fetch。

## 3. 原版已经具备什么

原版已经有以下完整或基本可用的功能，不能算成 fork 从零新增：

1. 通过 Electron 打开斗鱼页面登录，并在页面中退出、切换账号。
2. 自动读取粉丝牌列表，显示主播、房间号、等级、排名、今日亲密度和累计进度。
3. 自动领取荧光棒，然后读取背包数量并分配赠送。
4. 自动执行、定时执行、手动执行三种模式。
5. Cron 配置和未来三次执行时间预览。
6. 开机自启、托盘运行、赠送完自动退出。
7. 按百分比或者固定数量向多个房间赠送。
8. 自定义星期几赠送；不在所选星期时仍然先领取，再跳过赠送。
9. 配置持久化、当前执行日志和剩余荧光棒显示。
10. Windows、macOS 和 Linux 打包配置；README 简介只突出 Windows/macOS，但历史和脚本实际也有 Linux。

原版的双倍亲密度检测仍列在 README 的待办项。`6619ee3` 虽然增加了 `getConfigByUser()`，但当前源码没有调用它，不能据此认定已经实现多账号配置隔离或多账号同时运行。

主要依据：[原版任务流程](E:/Downloads/Code/douyu-keep/src/renderer/run/index.ts:22)、[粉丝牌列表](E:/Downloads/Code/douyu-keep/src/renderer/stores/fans.ts:34)、[原版配置](E:/Downloads/Code/douyu-keep/src/renderer/views/config/index.vue:11)、[Electron 登录、领取和调度](E:/Downloads/Code/douyu-keep/src/main/ipc.ts:11)。

## 4. 功能与行为总表

| 维度 | 原版 | fork 当前实现 | 实际意义 |
| --- | --- | --- | --- |
| 运行形态 | Electron 桌面应用 | Node.js + Express + Docker | 可在 NAS/服务器常驻，浏览器管理 |
| 管理界面 | 本机窗口 | 带密码的 WebUI | 手机、电脑均可访问同一服务 |
| 桌面能力 | 托盘、自启、自动退出 | 已删除 | 不再直接替代原版桌面使用方式 |
| 任务结构 | 领取和赠送串在一条流程 | 5 类业务任务独立调度 | 可分别设置频率、开关和手动执行 |
| 领取荧光棒 | 隐藏浏览器访问固定房间，等待 10 秒 | 随机选择已有粉丝牌房间，WebSocket 领取 | 不再依赖 Chromium 页面加载 |
| 保活赠送 | 百分比或数量 | 固定数量或权重 | 更清楚地区分少量保活与集中分配 |
| 双倍亲密度 | 待办 | 检测房间双倍卡后赠送 | 没有双倍时保留库存 |
| 临期礼物 | 无 | 按过期时间阈值筛选并赠送 | 可在过期前处理库存 |
| 礼物范围 | 主要是 ID 268 荧光棒 | 双倍/临期流程可处理多种限时背包礼物 | 实际能力比 README 的“临期荧光棒”描述更广 |
| 鱼吧 | 无 | 已关注鱼吧签到、极速签到、补签尝试 | 新增另一类日常任务 |
| 斗鱼登录 | 本地斗鱼页面会话 | Passport 扫码 + 本地 Cookie 快照 | 服务器端独立保存登录态 |
| Cookie 管理 | Electron Session | 分别保存 Passport、主站、鱼吧凭据 | 能分别处理三条登录链路 |
| 自动恢复 | 主要靠重新登录 | CookieCloud、safeAuth、鱼吧 SSO | 部分凭据失效后可恢复并重试 |
| 粉丝牌列表 | 已有，按等级排序 | 同步到各任务配置，按当前亲密度数值降序 | 管理方式和排序发生变化 |
| 背包展示 | 荧光棒总量 | 多行礼物明细、数量和过期时间 | 能判断库存结构和临期情况 |
| 日志 | 当前任务状态文字 | 分类日志、刷新/清空、容器标准输出 | 排查多个后台任务更方便 |
| 配置 | electron-store | 挂载目录中的 JSON + 旧格式迁移 | 配置可随容器持久化 |
| 发布 | 桌面安装包 | Docker 镜像 + fnOS FPK | 发布对象完全改变 |

## 5. 新增功能的具体实现

### 5.1 Docker 服务和 WebUI

最早的 Docker 与双倍检测提交是 `931852b`，随后 `d286437` 加入 WebUI。当前默认端口为 `51417`，配置路径是 `config/config.json`，Docker Compose 将宿主机 `./config` 挂到容器 `/app/config`，使用 `restart: unless-stopped`。

配置文件不存在时会生成默认配置并继续启动 WebUI，等待用户配置，修复了早期 fork 缺配置直接退出的问题。浏览器断开不会导致后端定时任务停止。

管理台包括总览、领取、保活、双倍、临期、鱼吧、登录配置和日志。支持路径导航、浅色/深色/跟随系统主题、可滚动列表、状态与错误提示、手动刷新和强制刷新。3.0.0 将早期字符串模板/命令式脚本式 WebUI 迁移为 Vue + Vite + TypeScript。

这里的“迁移到 Vue”是指 fork 自己早期的 Docker WebUI；原版桌面前端本来就已经使用 Vue。

WebUI 访问密码与斗鱼账号登录是两件事。前者由 `WEB_PASSWORD` 配置，默认 `password`；登录后发放随机会话 Cookie，设置 HttpOnly、SameSite=Strict，最长 30 天，会话存在内存中，服务重启后需要重新登录管理台。这不是多用户权限系统。

依据：[启动行为](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/docker/runtime.ts:99)、[默认环境参数](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/docker/index.ts:5)、[WebUI 鉴权](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/docker/server-auth.ts:51)。

### 5.2 独立任务与默认时间

五种业务任务分别保存自己的 `enabled` 和 Cron；CookieCloud 同步还有独立的后台调度。默认值如下，均按 `Asia/Shanghai` 解释：

| 任务 | 默认启用 | 默认执行时间 | Cron |
| --- | --- | --- | --- |
| 荧光棒领取 | 是 | 每天 03:10、05:10 | `0 10 3,5 * * *` |
| 粉丝牌保活 | 是 | 每周三 08:00 | `0 0 8 * * 3` |
| 双倍赠送 | 否 | 每天 17:20、20:20、22:20、23:20 | `0 20 17,20,22,23 * * *` |
| 临期礼物 | 否 | 每天 23:45 | `0 45 23 * * *` |
| 鱼吧签到 | 否 | 每天 00:23 | `0 23 0 * * *` |
| CookieCloud 同步 | 否 | 每天 00:05，启用时还会触发启动同步 | `0 5 0 * * *` |

默认“启用”不代表未登录也会实际执行任务；还需要登录凭据和适用的房间配置。

原版每次赠送前都先领取。fork 的保活、双倍、临期任务直接使用当前库存，领取是另一条计划。因此可以每天领取、每周少量保活、晚上检查双倍、深夜处理临期库存。

同一种任务有执行锁：定时触发遇到正在运行会跳过，手动重复触发会返回“任务正在执行中”。更改配置后只启动、停止或重载受影响任务；更新主题不应重启赠送计划，更新凭据一般也不需要整体重启。

3.10.0 将旧保活默认 `0 0 8 */7 * *` 迁移成每周三 08:00。`*/7` 位于“每月日期”字段，不表示连续每隔七天，跨月间隔也不固定；新默认的周频率更明确。其他自定义表达式保留。

依据：[默认配置](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/core/task-defaults.ts:3)、[调度锁和增量重载](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/docker/runtime-scheduler.ts:52)。

### 5.3 不依赖浏览器的荧光棒领取

原版创建隐藏 Electron 窗口，打开固定直播间 `4120796`，10 秒后关闭，并以窗口关闭作为领取流程结束。fork 初期曾改成 Puppeteer 无头浏览器，`8b5b0b6` 又用斗鱼弹幕 WebSocket 替换了浏览器。

当前流程是：读取粉丝牌列表，随机选择一个有效房间，建立 WebSocket，通过 Cookie 生成登录报文，收到登录响应后发送入房领取报文，收到 `h5ckres` 后查询背包。

对无粉丝牌房间、鉴权失败、提前断连和等待超时都有明确错误；WebSocket 等待上限为 15 秒，握手超时为 10 秒。当前 package.json 和运行镜像没有 Electron/Puppeteer 运行依赖，虽 Dockerfile 仍留有 `PUPPETEER_SKIP_DOWNLOAD` 环境变量，但不代表仍使用浏览器领取。

这减少了浏览器运行依赖；没有做内存和 CPU 对照压测，不能量化宣称性能提高多少。

依据：[领取任务](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/core/collect-gift-job.ts:11)、[WebSocket 流程](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/core/collect-gift.ts:118)。

### 5.4 双倍亲密度检测与赠送

这是原版明确未完成、fork 真正补齐的业务能力。当前通过 `/japi/interact/cdn/pocket/effective?rid=...` 查询房间道具，仅当存在 `type === 1` 且 `expireTime` 晚于当前时间时认为双倍卡生效。

用户可勾选参与双倍任务的房间，并设置分配方式。任务仅检测参与房间，单个房间检测失败时记录并跳过；没有任何有效双倍房间就不赠送。

支持两种礼物范围：`glowStick` 只处理荧光棒；`limitedTime` 将背包中带过期时间的礼物按礼物 ID 分组，分别分配赠送。后者不是“已经临期才送”，它会纳入所有有过期时间的候选。

一个重要特例：如果只剩一个检测到双倍的参与房间，代码把本轮该礼物的全部数量给它，即使配置是固定数量 1。这是当前实际分配策略，不能把固定数量理解成该场景下的硬上限。

依据：[双倍检测](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/core/double-card.ts:23)、[任务执行](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/core/double-card-job.ts:9)、[单房间特例](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/core/gift.ts:79)。

### 5.5 临期礼物自动处理

`8898fdc` 增加独立临期任务，`cba58a8` 扩大到多种限时礼物。当前读取背包明细，选取数量大于零、有过期时间、进入阈值的行，按礼物 ID 汇总数量，再按房间分配赠送。

默认阈值为 24 小时，支持自定义正数小时。默认是权重模式；自动生成粉丝牌配置时，第一个房间权重 1，其余为 0，后续可自行修改。固定数量模式也可选。

日志包含候选礼物、数量、过期时间、距离到期小时数、候选总预算以及跳过原因。没有过期时间的永久礼物不会被这个筛选器纳入。

有两点实际边界：当前筛选器没有按 `giftId === 268` 限定，因此不限于荧光棒；送礼接口只接受礼物 ID 和数量，不接受背包批次，程序只能按临期数量制定预算，不能保证斗鱼实际扣的是即将过期的那一批。代码对此已有明确日志说明。

依据：[临期执行](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/core/expiring-gift-job.ts:8)、[候选筛选](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/core/gift-task.ts:53)。

### 5.6 鱼吧签到、极速签到与补签

原版没有鱼吧任务。fork 在 2.0 阶段加入 HTTP 签到，并由 `eee1cf0` 改进为 dy-token 路径。

当前仅支持 `followed`，即签到全部已关注鱼吧。会分页读取关注列表并去重，先尝试极速签到，再逐个处理签到；对于部分普通失败重试一次。逐个鱼吧之间随机等待 5 至 8 秒。

签到后还会调用补签接口，依据返回的补签机会继续尝试，每个鱼吧最多 10 次。这是实际调用补签接口，并非仅展示补签状态。极速签到失败会继续普通签到，补签失败也独立记录。

会区分签到成功、今日已签到、已关闭/不存在、登录失效和 Gee 验证。遇到已关闭鱼吧可跳过；遇到登录态、Token 或 Gee 风控问题会提前停止。纯 HTTP 实现没有解决验证码这一能力。

界面还可查询鱼吧等级、经验、排名、头衔、未读数量和签到状态，部分字段或新接口不适用时有兼容查询路径。

依据：[鱼吧任务模式](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/core/yuba-check-in-job.ts:4)、[签到与补签实现](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/core/yuba-check-in.ts:164)。

### 5.7 Passport 扫码、CookieCloud 与本地恢复

扫码登录由 `e6f38c5` 引入。服务端生成自己的设备 Cookie 和二维码，区分等待扫码、已扫码待确认、过期、取消和失败，然后按 Passport → 主站 → 鱼吧完成交换并保存快照。

主站成功后先持久化，所以鱼吧桥接失败不会丢失已经获得的主站登录态；鱼吧失败可单独重试。后续修复包括设备 Cookie 初始化、主站登录 URL 规范化、鱼吧 Passport 桥接和 JWT Cookie 保留。

当前配置分别保存 `loginCookies.passport`、`loginCookies.main`、`loginCookies.yuba`。手填 Cookie 仍是兜底入口，Passport 的 `LTP0` 和设备信息可作为恢复材料。

CookieCloud 是可选兼容路径：从用户配置的服务拉取并解密浏览器快照，按域、路径、Secure 和过期时间选取 Cookie；当前仅支持 `legacy` 加密格式。项目把结果保存成本地快照，不把刷新结果写回浏览器或 CookieCloud。

日常任务使用本地快照，不需要每次运行都依赖 CookieCloud 请求。同步时会避免不完整的远端主站/鱼吧 Cookie 覆盖已经完整的本地快照。WebUI 登录动作本身也不再自动等同于一次 CookieCloud 同步。

部分请求向上抛出凭据错误时，恢复链会先验证本地状态，必要时刷新 CookieCloud，再尝试 Passport safeAuth 恢复主站，并按需求通过 SSO 恢复鱼吧。成功后重试一次原操作，不是无限重试，也不是保证 Cookie 永不失效。

3.6.0 还增加了三个 Cookie 状态指标。但当前所谓“有效”主要来自必要字段是否齐全，不是每次都请求斗鱼验证真实有效性，这一点见后文。

依据：[扫码状态机](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/docker/runtime-passport-qr-login.ts:44)、[快照选择](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/docker/runtime-effective-cookies.ts:91)、[恢复链](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/docker/runtime-cookie-recovery.ts:396)。

## 6. 原有逻辑具体改进在哪里

### 6.1 固定数量终于真正按固定数量赠送

原版会把排序后最后一个房间直接作为余量接收方，即使没有显式配置 `-1`。例如有 100 个荧光棒，两个房间各填 1，原版实际会分成 1 和 99。

fork 在 `b77d678` 改为：普通房间只送配置数；仅当某个房间显式填 `-1` 时，才把余量给它；最多允许一个 `-1`。

| 输入 | 原版 | fork |
| --- | --- | --- |
| 库存 100，A=1，B=1 | A=1，B=99 | A=1，B=1，保留 98 |
| 库存 100，A=1，B=-1 | A=1，B=99 | A=1，B=99 |

这直接影响是否会把库存提前送光，是最值得注意的行为修正之一。双倍任务只有一个有效房间时仍有“全部给它”的独立特例。

### 6.2 百分比改为相对权重

原版要求所有房间百分比之和等于 100。fork 当前使用 `weight / totalWeight`，权重填 1:3、10:30 或 25:75 在正常库存下表达相同比例，不要求凑成 100。

`9575cce` 修正了 fork 早期把权重继续除以 100 的错误。双倍任务只在实际生效的房间集合中重新分配，没有双倍的房间不会占用其赠送份额。

`48b3dfe` 还修复了原来用配置数量字段检查百分比分配总数的问题，改为检查实际计算的 count，并防止产生负余量。算法仍有整数取整和对非末尾正权重房间至少给 1 的策略，所以少量库存时不一定精确符合比例，不能当成通用最优分配算法。

依据：[原版分配](E:/Downloads/Code/douyu-keep/src/renderer/run/utils.ts:78)、[fork 分配](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/core/gift.ts:11)。

### 6.3 接口失败不再轻易伪装成成功或空背包

原版 `sendGift()` 只把响应转换成字符串，没有检查响应 JSON 中的业务错误码。HTTP 请求完成，即使返回业务失败，上层也可能打印赠送成功。

`e5c5c85` 引入业务响应检查，处理 `error`、`code`、`status_code` 和错误消息。背包、粉丝牌 HTML 缺失等异常也得到更清楚的诊断。

`1bbd8ee` 将“查询礼物失败”和“数量为零”分开：前者返回失败标记或抛错，后者才表示正常无库存；单房间双倍检测失败也不再阻断其他房间。

背包查询从单一固定房间的 v1 接口扩展为多个候选房间、v5/v1 回退，并将多行荧光棒数量相加；原版只查找第一个 ID 268 的条目。对多批次和接口变化的适应性更好。

`getDid()` 的两种页面格式匹配来自原版 `68946e7`，不能算 fork 首次修复；fork 的 async/await 写法另外消除了原版手写 Promise 在网络拒绝时可能没有正确结束外层 Promise 的路径。

依据：[原版 sendGift/getDid](E:/Downloads/Code/douyu-keep/src/renderer/run/utils.ts:21)、[fork 业务检查](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/core/api.ts:73)、[背包回退](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/core/api.ts:195)。

### 6.4 状态刷新更适合多粉丝牌列表

原版刷新主要直接查询用户和粉丝牌。fork 增加基础列表与详细状态分阶段加载，先展示列表，再补背包与双倍信息；前后端对相同的在途请求做复用，并限制部分并发查询。

当前后端粉丝牌基础列表缓存 1 分钟，粉丝牌详情缓存 5 分钟，鱼吧状态缓存 10 分钟；双倍详情查询并发上限为 4。状态缓存使用 generation 标记，失效前发起的旧请求不会重新覆盖有效的新缓存。

任务结束后失效对应状态缓存，手动强制刷新可以绕过已有快照，但如果已有同类请求在途，会复用它。强制刷新不是不计成本地再并发发一轮请求。

5 月历史中多次修复了列表不自动加载、切页没有刷新、刷新被旧 TTL 阻塞等问题，也存在回退提交。因此报告描述的是当前代码的缓存和刷新行为，不能简单累加每一条历史设计。

依据：[运行时缓存](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/docker/runtime-cache.ts:8)。

### 6.5 配置结构、保存及校验

fork 采用独立配置模块，处理部分更新、默认值、输入校验、旧格式迁移和粉丝牌同步。修改任务开关时会保留房间等其他配置，保存响应返回完整配置供页面同步，减少“界面看起来保存了，后端还是另一份状态”的问题。

3.10.0 将存储格式统一到 `loginCookies`、任务布尔 `enabled`、明确的 `allocationMode`、`roomAllocations`，双倍参与房间独立为 `participatingRoomIds`。旧 `cookie`、`manualCookies`、`manualPassport`、`active`、`model`、`send` 等兼容输入在边界转换，运行时代码使用统一结构。

会校验 Cron、固定数量整数及 -1 个数、非负有限权重、临期阈值和双倍参与配置。房间集合依据粉丝牌同步，保留已有房间设置，并清理不再属于当前粉丝牌集合的配置。

升级会写回新配置格式，旧字段不双写。降级 fork 时需要同时恢复旧配置备份，单独回滚镜像可能不够。这里主要指 fork 历史 JSON 格式之间的迁移，没有发现一键导入原版 electron-store 全部桌面配置和会话的功能。

依据：[配置部分更新](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/docker/config-store.ts:93)、[校验](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/docker/config-validation.ts:35)、[配置迁移说明](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/README.md:75)。

## 7. Git 历史中的关键阶段

### 7.1 原版发展轨迹

| 时间 | 代表提交 | 变化 |
| --- | --- | --- |
| 2022-09 至 2023-07 | `7e30845`、`b7424fd` | 工程初始化和依赖升级 |
| 2023-08-05 至 08-09 | `2492304`、`5b05ab9`、`a360bdb`、`6f08c6e`、`6b83021` | 首页、切换账号、配置持久化、赠送、开机自启与定时执行 |
| 2023-08-09 至 08-10 | `d2aea21`、`af376b6`、`d7b1421`、`3affd37` | 1.0.0、托盘、默认托盘、数量赠送修复 |
| 2023-08-13 至 08-20 | `23e0b4a`、`87cfccd`、`88c6398` | 自动退出修复、Linux/deb 打包 |
| 2023-10-10 | `822f815`、`57449d5` | 登录状态验证和重新登录后任务执行修复 |
| 2024-02 至 05 | `6269dbe`、`2ca5a6d`、`f999996` | Mac ARM、失败转赠意图、1.0.9 |
| 2024-09 | `d9c069f` / `e1fdccc`、`6619ee3` | 自定义星期赠送、按用户查配置辅助函数 |
| 2025-12-24 | `68946e7`、`d3bb0b6` | 修复 did 页面解析兼容、macOS 15 构建环境 |

### 7.2 fork 发展轨迹

| 时间 / 版本 | 代表提交 | 实质变化 |
| --- | --- | --- |
| 2026-04-08 | `931852b` | 从原版继续发展，加入 Docker、共享 core、双倍检测和独立双倍计划 |
| 04-09 至 04-11 | `d286437`、`3f0a287`、`bcd9808`、`7c1f864`、`48b3dfe` | WebUI、缺配置可启动、粉丝牌驱动配置、独立领取、任务锁与校验 |
| 04-12 至 04-17 | `2089df8`、`b77d678`、`c2d8ced`、`df11e0f` | WebUI 密码、显式余量规则、路径导航、过期时间显示，版本到 1.6.0 |
| 04-24 / 2.0.0 | `c30ec78`、`ead9fa1`、`89c8208` | Docker WebUI 功能扩展，CookieCloud、鱼吧及背包相关实现和修复 |
| 04-25 至 04-30 | `6702f65`、`e5c5c85`、`8b5b0b6`、`6e1edce`、`eee1cf0` | 删除桌面端、显式 API 错误、WebSocket 领取、局部重载、dy-token 鱼吧签到 |
| 05-01 至 05-07 / 2.3-2.4 | `8898fdc`、`cba58a8`、`9575cce`、`1bbd8ee` | 临期赠送、多礼物范围、权重修复、失败语义修复 |
| 05-10 至 05-13 / 2.5.0 | `079c810`、`9d8b007`、`2360b9a` | 请求节流、渐进加载、Node 24、模块拆分 |
| 05-13 至 05-15 / 3.0.0 | `d26a1ac`、`3238e75`、`808cccb`、`c1e543c` | 完整 Vue/Vite/TS WebUI，移除旧桥接、渲染和启动路径 |
| 05-16 至 05-19 / 3.1.0 | `32180df`、`14e30d0`、`9315f6c` | 限制项目许可证、保存状态同步、统一默认值 |
| 05-29 至 06-02 / 3.2.0 | `fef4668`、`d095edf`、`84cf34e`、`e2ceca5` | 凭据失效恢复、safeAuth、Passport 持久化、运行时职责拆分 |
| 06-05 至 06-07 / 3.5.0 | `e6f38c5`、`0cbb241`、`ce50a16`、`4e54368`、`ef87f3a` | 扫码登录、鱼吧桥接、JWT 保留、强制刷新、恢复能力增强 |
| 06-11 至 06-19 / 3.6.0 | `4baccdf`、`4d2b809` | 登录页面展示三种 Cookie 的诊断状态 |
| 07-11 至 07-12 / 3.7-3.8 | `5db8f91`、`7b7a204`、`0058de5`、`da00d05` | 减少重复工作、CI 先跑测试、固定侧栏、主题按钮优化 |
| 07-19 / 3.9.0 | `f69b1ef`、`310ff1a`、`ebc8027`、`3fa9dc2` | fnOS FPK 发布及应用元数据、入口和固定端口修复 |
| 07-20 至 07-21 / 3.10.0 | `c0bcd29`、`a24d676`、`6753873` | Passport 字段顺序、统一配置模型、修正保活默认星期计划 |
| 09-05 | `fbb174b`、`06d3f14`、`b9f6f52` | 归档暂缓的亲密度上限研究、Trellis 与工作记录更新；不是新增业务版本 |

版本号有跳跃，不能仅根据数字推断缺失版本包含额外功能。本文以实际提交和当前代码为准。

## 8. 工程和发布变化

原版运行逻辑分散于 `src/main`、`src/renderer/run`、Pinia stores 和 Vue 页面，依赖 Electron IPC、浏览器会话以及 electron-store。fork 当前分成 23 个 `src/core` 文件、34 个 `src/docker` 顶层文件，以及 63 个 `src/docker/webui` 文件。

core 负责斗鱼接口、分配、领取、双倍、临期、鱼吧和凭据处理；docker 层负责配置、运行时、任务调度、缓存、登录态协调、HTTP 路由和鉴权；WebUI 层负责 Vue 页面和资源状态。共享任务元数据和默认值减少了各页面重复定义任务类型、日志类别、调度字段等情况。

| 技术项 | 原版声明 | fork 声明 |
| --- | --- | --- |
| 运行时 | Electron 25 | Node.js 24，要求 `>=24 <25` |
| HTTP 服务 | 无独立后端服务 | Express 5 |
| 前端 | Vue 3.3 + Vuetify + Pinia + Vue Router | Vue 3.5 + Vite 8，项目内组件及资源状态模块 |
| TypeScript | 5.1 | 6.0 |
| 定时器 | cron 2、cron-parser 4 | cron 4、cron-parser 5 |
| 依赖管理 | Yarn | npm + package-lock + npm ci |
| 持久化 | electron-store | 文件 JSON |
| 新运行依赖 | 无 | ws、qrcode、Express 等 |

这些是本地 package.json 声明，不代表联网查询的最新版本或所有安装依赖的精确版本。

测试覆盖集中在配置约束、API 路由鉴权与返回、Passport 登录与恢复、强制刷新、礼物任务、鱼吧兼容、排序和 fnOS 打包契约。CI 在构建前执行 lint、后端/前端类型检查、contract tests 和 Docker runtime 构建。相较原版没有测试脚本，这是明确的验证基础设施改进，但大量测试使用替身或检查契约，不等同于真实斗鱼端到端验证。

镜像使用多阶段构建，运行层只带生产依赖及编译结果。正式版本标签发布 `完整版本号` 和 `latest`，正式镜像包含 linux/amd64、linux/arm64；默认分支推送 `edge`，当前 edge 工作流仅构建 amd64，不能把正式版的双架构支持套用到所有渠道。

fnOS FPK 会等待同版本双架构镜像可用后构建，并附校验文件，包含配置持久化和桌面 WebUI 入口。其本质仍是 Docker 应用封装，不是重写出的 fnOS 原生业务后端。

依据：[依赖和验证脚本](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/package.json:13)、[镜像分层](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/Dockerfile:1)、[CI 与发布渠道](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/.github/workflows/docker.yml:46)、[fnOS 发布](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/.github/workflows/fnos-fpk.yml:99)。

## 9. 减少、移除和未实现的内容

1. **桌面能力移除。** 不再有原版 Electron 窗口、托盘、桌面安装包、AutoLaunch 和赠送完退出选项。当前主要是服务器常驻模式。
2. **原版星期选择交互改变。** 独立任务 Cron 可表达星期限制，但不再是原版“先领取，再按 time/timeValue 判断是否赠送”的同一流程。
3. **多账号并行没有实现。** 当前是一套服务配置、一组主站/鱼吧/Passport 凭据和一个 WebUI 访问密码。更换凭据可以切换当前账号，不等于多账号调度中心。
4. **每日亲密度上限控制没有实现。** `fbb174b` 的研究文档明确标为 Deferred / not implemented。显示今日亲密度、检测双倍，不等于会检查剩余上限后停止赠送。
5. **Go/Rust 重写没有落地。** 历史中有研究、计划或归档记录，但当前后端仍是 TypeScript/Node，不能据任务标题宣称已换语言。
6. **日志不是持久化审计库。** WebUI 日志最多保存内存中的 500 条，同时输出到 stdout；容器是否长期留存日志取决于部署环境。原配置 JSON 也不是数据库。
7. **Cron 未来三次预览被简化。** 原版明确显示未来运行列表；fork 当前仍计算相关结果用于校验，但界面不再常规显示未来三次，任务状态中保留下次执行信息。
8. **许可声明发生实质变化。** 原版 package.json 声明 MIT；fork package.json 为 `UNLICENSED`，LICENSE 仅声明个人学习、技术研究与非商业性技术交流使用，修改来自 `32180df`。这里只记录仓库声明差异，不对其法律效力及原有代码权利归属作判断。

依据：[暂缓研究](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/.trellis/spec/backend/douyu-fan-intimacy.md:3)、[内存日志](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/docker/logger.ts:7)、[Cron 预览文本](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/docker/webui/composables/use-cron-preview.ts:64)、[fork 许可文件](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/LICENSE:1)。

## 10. 当前残留问题与能力边界

### 10.1 已离线复现：连续赠送失败会重复累计转赠数量

原版在 `2ca5a6d` 增加失败转交，但表达式 `item?.count ?? 0 + faildNumber` 在 count 有值时不会加上失败数量。fork 当前改为先执行 `item.count += failedNumber`，因此单次失败后的转交确实更接近原意。

但是下一次又失败时，catch 执行 `failedNumber += item.count`，item.count 已经包含此前的失败数，导致重复相加。

离线模拟三个房间计划分别送 1、2、3 个，前两个房间失败、第三个成功：

| 房间 | 计划数 | 实际尝试数 | 结果 |
| --- | --- | --- | --- |
| A | 1 | 1 | 失败，待转交 1 |
| B | 2 | 3 | 失败，代码把待转交计算成 4，正确应为 3 |
| C | 3 | 7 | 正确应为 6，代码却尝试 7 |

这可能导致库存不足，或把额外库存赠送出去。因此只能说“改进了单次失败转交”，不能说转赠已完全修好。位置：[job-gift-utils.ts](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/core/job-gift-utils.ts:103)。本次仅分析，未修复。

### 10.2 部分失败会停留在日志层

`sendGifts()` 对参数解析失败直接 return，对赠送失败累积后记日志但不向外抛错；保活分配异常、临期背包获取失败等分支也可能正常 return。HTTP 手动触发路由只要 await 没抛异常就返回 `{ ok: true }`。

所以“请求成功/任务执行完毕”不一定代表所有礼物送成功。此外，凭据自动恢复只处理向上抛出的错误；有些底层错误被转换成通用错误或提前吞掉，就不会触发该恢复链。不能把恢复能力描述成覆盖所有任务失败。

依据：[赠送错误处理](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/core/job-gift-utils.ts:95)、[恢复触发边界](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/docker/runtime-task-runners.ts:69)、[手动路由成功返回](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/docker/server-task-routes.ts:17)。

### 10.3 按任务类型加锁，没有统一库存锁

`activeRuns` 以 `collectGift`、`keepalive`、`doubleCard` 等类型为 key，只防同类重复运行。保活、双倍和临期任务可以同时读取同一背包并分别制定赠送计划。

由代码可推导：如果这些任务的时间重叠或用户同时手动触发，可能出现库存竞争、后续赠送失败或与预期分配不一致。本次没有对真实账号做并发赠送验证。这是独立任务设计需要考虑的限制，不是声称已发生线上事故。

依据：[任务锁范围](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/docker/runtime-scheduler.ts:40)。

### 10.4 Cookie “有效”指示不等于实时鉴权通过

`createCookieDiagnostics()` 检查的是关键字段存在与否，例如 Passport 是否含 LTP0、主站是否有若干 acf 字段。WebUI 将这些布尔值显示为“有效/无效”。

过期或被服务端撤销、但字段仍齐全的手填 Cookie，也可能显示“有效”。真实有效性要靠后续实际 API 请求和恢复过程判断。

依据：[字段诊断](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/core/cookie-cloud.ts:274)、[有效/无效文案映射](E:/Downloads/Code/douyu-keep/.materials/douyu-keep-just-works/src/docker/webui/cookie-source-copy.ts:14)。

### 10.5 平台依赖仍然存在

双倍检测不是所有亲密度加成来源的通用检测器；它只检查指定房间接口中的一种有效道具。它也不会自动购买双倍卡、激活付费道具或者读取并控制每日亲密度剩余额度。

临期任务无法控制批次；鱼吧纯 HTTP 流程遇到 Gee 验证会停止；粉丝牌和主播 ID 仍部分依赖 HTML 字段/正则解析。平台接口变化可能影响这些能力，本文没有进行线上可用性验收。

## 11. 本次验证范围

已经完成：

- 读取原版全部 56 条可达提交及 fork 历史，分析功能、修复、重构、发布和文档提交；对关键改动检查实际 diff。
- 确认共同祖先、版本、领先/落后关系和源代码规模。
- 逐项核对任务、分配、Cookie、WebUI、配置、缓存、发布、测试及未实现研究记录。
- 使用 Node 24 的 TypeScript 去类型能力在内存中加载当前纯逻辑，验证固定数量、显式余量、权重 1:3、单双倍房间全部赠送行为。
- 用替身 sendGift/getDid/sleep 离线复现连续两次失败的转赠累计问题，没有读取真实 Cookie，没有向斗鱼发送礼物。
- 执行不依赖 npm 安装的 `node --test test/fnos-packaging-contract.test.js`。

最后一项在当前 Windows 工作区中 2 项均失败：一项假定 Unix 可执行权限位存在，另一项用仅匹配 LF 的正则检查实际为 CRLF 的 YAML。这能说明测试对 Windows 检出不兼容，不能据此断言 Linux 发布工作流失败。

fork 本地没有 node_modules，本次没有安装依赖、没有执行完整 9 文件测试套件、没有完整构建镜像或运行真实斗鱼登录/领取/赠送。工程改进以源码和 CI 配置为证据，线上功能是否当下全部可用不在本次已验证范围内。

## 12. 对使用和后续开发的判断

如果目标是 NAS 或服务器长期运行，并希望每天领取、少量保活、等待双倍和处理临期礼物，fork 提供的功能与部署方式明显更匹配。它把原来的单一赠送工具扩展成多任务管理服务。

如果目标是保留 Windows/macOS 桌面托盘、开机启动后执行一次并退出，原版的产品形态仍更直接；当前 fork 需要改变运行和管理方式。

如果准备将 fork 的逻辑移植回原版，最有价值的模块是 `src/core` 的双倍、临期、鱼吧、背包回退、业务错误检查，以及新的分配规则。移植时需要单独适配凭据与调度，并先处理上述转赠累计和失败传播问题，不能直接把整个 Docker 运行时当成 Electron 的增量补丁。
