<div align="center">
  <img src="./icon.png" alt="douyu-keep" width="76">
  <h1>douyu-keep</h1>
  <p><strong>斗鱼粉丝牌 Windows 本地管理工具</strong></p>
  <p>基于 tophtab/douyu-keep-just-works，保留业务后端、配置体系和 WebUI，支持 Windows 10/11 x64。</p>

  <p>
    <a href="https://hub.docker.com/r/tophtab/douyu-keep-just-works"><img alt="Docker Pulls" src="https://img.shields.io/docker/pulls/tophtab/douyu-keep-just-works?logo=docker&label=pulls"></a>
    <a href="https://hub.docker.com/r/tophtab/douyu-keep-just-works/tags"><img alt="Docker Image Size" src="https://img.shields.io/docker/image-size/tophtab/douyu-keep-just-works/latest?logo=docker&label=image"></a>
    <a href="https://github.com/tophtab/douyu-keep-just-works/releases"><img alt="Version" src="https://img.shields.io/github/package-json/v/tophtab/douyu-keep-just-works?label=version"></a>
    <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-non--commercial-orange"></a>
  </p>

  <p>
    <a href="#快速部署">快速部署</a> ·
    <a href="#功能一览">功能一览</a> ·
    <a href="#配置建议">配置建议</a> ·
    <a href="#声明">声明</a>
  </p>

  <img src="./doc/海报.png" alt="douyu-keep-just-works Docker WebUI 预览">
</div>

## Windows 使用

在本仓库 Actions 的 Windows Desktop 构建产物中下载 x64 安装包或 ZIP。ZIP 解压后双击 `douyu-keep.exe`；安装包可选择安装目录、创建桌面和开始菜单快捷方式。运行时已随包携带，无需安装 Node.js 或 Docker。

- 启动后自动用默认浏览器打开本地 WebUI，不使用 Electron，不需要输入本地管理密码；斗鱼账号仍需在登录配置页扫码或配置 Cookie。
- 关闭浏览器后继续在托盘运行。双击托盘图标重新打开，右键菜单提供配置目录、开机自启和退出。
- 开机自启默认关闭，勾选后以托盘模式启动；ZIP 移动目录后需要重新勾选。
- 配置文件位于 `%APPDATA%\douyu-keep\config.json`。升级和卸载默认保留配置；迁移 fork 配置前先退出程序，再备份并替换该文件。
- 后端只监听 `127.0.0.1`，端口自动分配。重复启动会在浏览器中打开已有服务，不重复运行任务。退出 WebUI 登录后也可通过托盘重新打开并登录。
- 退出时停止调度并等待任务结束，最多等待 30 秒；Windows 关机或强制结束进程无法保证正在运行的任务完整结束。
- 计算机睡眠、关机或退出程序期间不执行任务，恢复后按下一次 Cron 运行，不补跑错过的任务。
- 更新或卸载前请先从托盘退出程序；运行中的程序会阻止安装、卸载。

详细构建、验证及行为修复见 [Windows 说明](doc/windows.md)。上游来源为 [tophtab/douyu-keep-just-works](https://github.com/tophtab/douyu-keep-just-works)，最初项目为 [Curtion/douyu-keep](https://github.com/Curtion/douyu-keep)。保留上游许可和贡献记录。

## Docker 部署（上游渠道）

以下镜像由上游发布，不包含本 Windows 分支的修复。本分支可通过 Dockerfile 自行构建，默认不会推送上游镜像仓库。

```yaml
services:
  douyu-keep-just-works:
    image: ${DOCKER_IMAGE:-tophtab/douyu-keep-just-works}:${DOCKER_TAG:-latest}
    container_name: douyu-keep-just-works
    restart: unless-stopped
    ports:
      - '51417:51417'
    volumes:
      - ./config:/app/config
    environment:
      - TZ=Asia/Shanghai
      - WEB_PASSWORD=password
```

### 飞牛 fnOS

推送 `vX.Y.Z` 或 `VX.Y.Z` tag 后，发布 Workflow 会先生成同版本的
amd64/arm64 Docker 镜像，再自动构建飞牛安装包并上传到该 tag 对应的
[GitHub Release](https://github.com/tophtab/douyu-keep-just-works/releases)。下载
`douyu-keep-just-works-X.Y.Z-fnos.fpk` 后，可在飞牛 fnOS 应用中心手动安装；
安装包会持久化应用配置，并在桌面提供 WebUI 入口。

当前安装包沿用 Docker 版本的默认 WebUI 密码 `password`。首次登录后请避免将
服务直接暴露到公网；安装包暂不提供修改容器环境变量的安装向导。

## 功能一览

| 功能 | 用途 |
| --- | --- |
| 扫码登录 | 通过斗鱼 passport 二维码创建本项目自己的本地登录快照 |
| 荧光棒领取 | 自动领取荧光棒 |
| 粉丝牌保活 | 定时执行保活任务，降低粉丝牌掉牌风险 |
| 双倍任务 | 检测双倍亲密度任务并分配执行 |
| 临期礼物 | 自动赠送临期荧光棒 |
| 鱼吧签到 | 自动执行鱼吧签到 |
| WebUI 管理 | 查看状态、修改配置、查看日志、手动触发任务 |
| CookieCloud | 可作为浏览器 Cookie 同步兼容路径 |

## 配置建议

- 推荐优先使用登录页的“扫码登录”。它会通过斗鱼 passport 二维码创建本项目自己的本地登录快照，并按 passport -> 主站 -> 鱼吧的顺序保存。
- CookieCloud 仍可作为浏览器同步兼容路径。它只会把浏览器 Cookie 拉取为本地登录快照；项目不会把刷新后的 Cookie 写回浏览器或 CookieCloud。
- CookieCloud 同步不会用不完整的浏览器快照覆盖已经完整的本地主站或鱼吧快照，除非你手动保存新的 Cookie。
- 手填 Cookie 只作为兜底，适合临时修复登录态或保存独立的 passport Cookie。
- 建议把 `WEB_PASSWORD` 改成只有自己知道的值，并避免把 `config.json`、Cookie、CookieCloud 密码或 WebUI 密码贴到公开 issue。

### 配置升级与回滚

- 升级前请备份持久化目录中的 `config/config.json`。程序加载旧配置后会写回新的 canonical 格式，旧字段不会双写。
- 新格式使用 `loginCookies`、任务 `enabled`、`allocationMode` 和 `roomAllocations`。旧配置会在读取时自动迁移，但旧版本程序无法读取写回后的新格式。
- 如需回滚到旧版本镜像，必须同时恢复升级前备份的 `config/config.json`；仅回滚镜像版本不够。
- Cron 继续使用 npm `cron` 的六字段格式：`秒 分 时 日 月 星期`。保活默认在上海时区每周三 08:00 执行，对应 `0 0 8 * * 3`；旧默认值 `0 0 8 */7 * *` 会自动迁移，其他自定义表达式保持不变。

## 理念：it just works

纯 vibe coding，能用就行。（出自 Todd Howard 超级小陶）

## 声明

本项目仅供个人学习、技术研究与非商业性技术交流使用，仅提供代码与部署方式参考。

使用者应自行确认其使用行为符合目标平台规则及当地法律法规，作者不对因使用本项目产生的任何直接或间接后果负责。

## 致谢

本项目最初基于 Curtion 的相关实现演进而来，感谢原项目提供的思路与基础：

- [Curtion/douyu-keep](https://github.com/Curtion/douyu-keep)
- [qianfeiqianlan/yuba-check-in](https://github.com/qianfeiqianlan/yuba-check-in)
- [qianjiachun/douyuEx](https://github.com/qianjiachun/douyuEx)
- [starudream/sign-task](https://github.com/starudream/sign-task)
- [每日荧光棒领取的非浏览器模拟方案](https://nicelee.top/blog/2021/09/28/python-douyu-danmu/)
- [LINUX DO 社区](https://linux.do/)
- 给 AI 立规矩的开源框架：[trellis](https://github.com/mindfold-ai/Trellis)
