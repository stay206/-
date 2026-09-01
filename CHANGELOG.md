
## v1.0.1（合并原仓库 v1.0.0 + 本地 v0.31.x 云端同步）

- 合并原仓库（AKISATO57/AKI-Bangumi-Vault）v1.0.0 全部更新：玻璃拟态新界面、编年史/目录/用户日志、启动流程重构、测试框架、依赖升级等。
- 保留并适配本地 v0.31.1 ~ v0.31.3 的全部云端同步功能：
  - GitHub Personal Access Token 新增「获取 Token」按钮，一键跳转 GitHub 创建页并预填 repo 权限。
  - 云端同步整合进「账号与同步」面板；字段名明确区分「Bangumi Access Token」与「GitHub Personal Access Token」。
  - 资料库 <-> GitHub 仓库「资料库」分支双向同步（云端保存 / 从云端恢复 / 一键同步到云端）。
  - 时间胶囊：桌面版读取完成后自动同步到云端 vault/timeline.json，网页版从云端恢复时间胶囊缓存。
  - 新设备本地资料库为空且已配置 GitHub Token 时，自动从云端分支恢复数据。
- 版本号统一为 v1.0.1（package.json / main.js APP_USER_AGENT / window.BV_APP_VERSION / 设置页构建戳兜底值）。
- docs/GITHUB_PUBLISH.md 同步更新至 v1.0.1 发布指引；源码打包 RequiredEntries 调整为指向现有 Release Notes。

## v1.0.0（原仓库版本）

- 新界面：玻璃拟态（lg26 UI）作为默认新界面，保留经典界面（classic）一键切换；提供主题/运动/卡片布局等精细化设置。
- 编年史（Chronicle）功能：目录（Indices）、用户日志（Blogs）、话题（Topics）深度采集与详情面板，支持小组成员、日志正文 HTML 清洗、目录评论分页。
- 桌面版启动流程重构：抽离 lib/startup-sequence.js（启动阶段划分与日志记录）和 lib/window-state.js（窗口位置/尺寸/最大化持久化与异常值归一化）。
- 完整性校验：资料库各 JSON 文件清单数量与实际条目数对比，发现不一致时阻止覆盖并提示。
- 自动化测试框架：test/packaging.test.js、chronicle-directory.test.js、startup-sequence.test.js、window-state.test.js、ui-hover-feedback.electron.js 共 5 个测试文件；package.json 新增 test / check 脚本。
- 源码打包：scripts/package-source.ps1 + scripts/source-package-manifest.txt 标准化发布流程，支持目录清单、文件大小、Checksum 校验。
- 依赖升级：Electron 37.2.6 → 39.8.10，electron-builder 26.0.12 → 26.15.7，新增 linkedom 0.18.12（编年史 HTML 解析）；build.files 新增 lib/**/*。
- Schema 17 → 18：新增 uiVersion（lg26/classic）、uiVersionPicked（是否选过 UI）、shelfMode（自动/始终/关）设置项；启动时按 schema 决定是否切换新界面。
- 时间胶囊逐集匹配：启动后 lazy setTimeout 匹配事件与收藏条目逐集观看记录，不阻塞渲染。
- 设置面板：新增 `settingsBuildStamp` 版本戳（renderBuildStamp 读取 window.BV_APP_VERSION）；新增 UI 版本分段控件（经典 / 1.0 · 玻璃拟态）。
- 实体卡片图片：image_cache_mode visible-v1、entity_card_image_version 2、timeline_image_cache_version 3 增量升级。
- 构建辅助：.cmd / .ps1 启动脚本统一配置 ELECTRON_MIRROR / ELECTRON_BUILDER_BINARIES_MIRROR / npmmirror 国内镜像与缓存路径。
- README.md：更新截图源，新增第三张功能图。

## v0.31.3

- 取消网页版「缓存当前封面到云端」方案，恢复为桌面版本地目录缓存（网页版无本地服务时提示）。
- 网页版「读取全部时间胶囊」云端化保留：从云端 vault/timeline.json 读取；桌面版读取后自动同步到云端。
- GitHub Personal Access Token 新增「获取 Token」按钮，一键跳转 GitHub 创建页并预填 repo 权限。
- 云端同步合并入「账号与同步」面板；Access Token 改名为「Bangumi Access Token」。

## v0.31.2

- 云端同步合并入「账号与同步」面板，不再单独成卡。
- Access Token 字段改名为「Bangumi Access Token」，与 GitHub Token 区分。
- GitHub Personal Access Token 新增「获取 Token」按钮，一键跳转 GitHub 创建页并预填 repo 权限。
- 网页版「缓存当前封面」改为云端化：封面上传到 GitHub 仓库 vault/covers/，读取走 raw 通道。
- 网页版「读取全部时间胶囊」云端化：从云端 vault/timeline.json 读取；桌面版读取后自动同步到云端。

## v0.31.1

- 新增「同步到云端」按钮，可把本地资料库推送到 GitHub 仓库的「资料库」分支。
- 新增「云端同步（GitHub 仓库）」独立弹窗，支持保存 Token / 仓库 / 分支、从云端恢复和一键推送。
- 云端同步与高级网络设置从同层网格中拆分，彻底解决设置面板元素重叠问题。
- 新设备本地资料库为空时，若已配置 GitHub 信息则自动从云端分支恢复。
- 移除自建代理部署说明（在线版仍保留自定义 API / 图片反代 / 站点镜像设置）。

## v0.29.9

- 重新整理设置窗口为更紧凑的横向布局，折叠高级网络设置时尽量一屏显示。
- 项目链接移动到底部信息栏，降低视觉权重。
- 优化高级网络设置展开动画和设置项对齐。

## v0.29.7

- 新增高级网络设置：API 地址、图片反代地址、Bangumi 站点地址。
- 默认登录与收藏同步仍使用官方 api.bgm.tv；可手动开启“收藏同步 / 登录也使用自定义 API”。
- 公共标签等公开条目信息可使用自定义 API。
- 支持将 lain.bgm.tv / bgm.tv 图片地址改写到自定义图片反代。
- 支持将“打开 Bangumi”和标签跳转改到自定义站点镜像。
- 设置页增加 Access Token 经第三方反代的安全提示。


## v0.29.1 - Time fields and public tag refresh preview

- Refresh public tags for the current filtered result set instead of only filling empty tags.
- Add separated time fields for collection marked time, collection update time, comment time, first backup time, and local sync time.
- Include new time fields in exports.

# Changelog

## v0.29.4

- 公共标签改为纯 API 获取，不再抓取 Bangumi 官网页面。
- 标签区保持命名为「公共标签」。
- 将详情页「Bangumi记录更新」改名为「API更新时间」。
- 明确 API 标签可能与网页展示略有差异。


## v0.29.0

- 新增「我的标签 / 公共标签」分离显示。
- 新增「补全公共标签」按钮，可为当前筛选结果逐条读取 Bangumi 条目公共标签。
- 标签筛选侧栏支持按「我的标签」和「公共标签」分别筛选。
- 条目详情页新增公共标签区，公共标签支持跳转到 Bangumi 标签页。
- JSON、CSV、Excel、Word、离线 HTML 和完整 ZIP 导出会保留我的标签、公共标签与全部标签。

## v0.28.0

- 桌面端改为 Electron 独立窗口。
- 应用显示名改为「Bangumi 保管库」。
- 使用粉色电视图标作为窗口和任务栏图标。
- 顶部标题栏与网页界面融合。
- 本地数据目录中文化为 `资料库/`。
- 支持旧版 `VaultData/` 自动迁移到 `资料库/`。
- 整理 GitHub 开源发布文件。
- 增加在线网站版说明：https://stay206.github.io/-/

## 历史版本

历史变更记录见 `docs/CHANGELOG_v0.xx.txt`。

## v0.29.10

- 修正设置界面横向布局、边框错位与输入框对齐。
- 调整账号与同步区域高度，减少空白。
- 高级网络设置改为独立折叠条，不影响其它卡片边框。
- 底部 GitHub / Bangumi 图标放大并增强可读性。
- 新增主题色选项。
- 将“同步最近”按钮改为轻量紫色样式。
