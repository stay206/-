# Bangumi 保管库 v0.31.2

## 重点更新

- 新增「同步到云端」按钮，可把本地资料库推送到 GitHub 仓库的「资料库」分支
- 网页版「缓存当前封面」改为云端化：封面上传到 GitHub 仓库 vault/covers/，读取走 raw 通道
- 网页版「读取全部时间胶囊」云端化：从云端 vault/timeline.json 读取；桌面版读取后自动同步到云端
- 云端同步整合进「账号与同步」面板，不再单独成卡，设置更集中
- GitHub Personal Access Token 新增「获取 Token」按钮，一键跳转 GitHub 创建页并预填 repo 权限
- 新设备本地资料库为空时，若已配置 GitHub 信息则自动从云端分支恢复

## 优化

- 原 Access Token 字段改名为「Bangumi Access Token」，与 GitHub Token 明确区分
- 精简 GitHub Token 获取说明为按钮跳转式引导，降低上手成本
- 网页版时间胶囊读取优先云端，无 Token 时回退 IndexedDB

## 修复

- 修复设置面板中「高级网络设置」与「云端同步」折叠面板重叠问题，云端同步从同层网格拆分
- 修复网页版封面云端缓存跨域失败：fetch + img+canvas + 图片代理多级回退

## 说明

- 网页版无法直接抓取 Bangumi 时间线页面，时间胶囊依赖桌面版先读取并同步到云端
- 封面云端缓存需在设置中配置 GitHub Token / 仓库 / 分支
- GitHub Token 永远不会写入云端数据
- 移除自建代理部署说明（在线版仍保留自定义 API / 图片反代 / 站点镜像设置）
