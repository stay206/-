# Bangumi 保管库 v0.31.2

## 重点更新

- 云端同步整合进「账号与同步」面板，不再单独成卡，设置更集中
- 网页版「缓存当前封面到目录」改为「缓存当前封面到云端」，封面上传到 GitHub 仓库 vault/covers/，读取走 raw 通道
- 网页版「读取全部时间胶囊」云端化，从云端 vault/timeline.json 读取已同步的时间胶囊
- GitHub Personal Access Token 新增「获取 Token」按钮，一键跳转 GitHub 创建页并预填 repo 权限

## 优化

- 原 Access Token 字段改名为「Bangumi Access Token」，与 GitHub Token 明确区分
- 桌面版读取时间胶囊后自动同步到云端，网页版可直接从云端恢复
- 精简 GitHub Token 获取说明为按钮跳转式引导，降低上手成本
- 网页版时间胶囊读取优先云端，无 Token 时回退 IndexedDB

## 说明

- 网页版无法直接抓取 Bangumi 时间线页面，时间胶囊依赖桌面版先读取并同步到云端
- 封面云端缓存需在设置中配置 GitHub Token / 仓库 / 分支
- GitHub Token 永远不会写入云端数据
