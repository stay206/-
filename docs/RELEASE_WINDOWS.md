# Windows 发布流程

## 本地打包

1. 安装 Node.js LTS。
2. 运行：

```bash
npm install
npm run dist:win
```

也可以双击：

```text
Build-Windows-Desktop.cmd
```

输出目录：

```text
dist/
```

## 安装目录资料库保护

- 桌面版与便携版都将离线资料保存在程序同级的 `资料库/`。
- `build/installer.nsh` 是 Windows 安装器的一部分，升级时会先保护旧版 `资料库/`，完成程序替换后再恢复；手动卸载只移除程序文件，不会删除该目录。
- `package.json` 已通过 `build.nsis.include` 固定加载此脚本。重新运行 `npm run dist:win` 或 `Build-Windows-Desktop.cmd` 会自动带上相同保护，不要删除或改名 `build/installer.nsh`。
- 为了让程序可写入同级资料库，建议安装到当前用户有写入权限的位置；不要选择受保护且不可写的系统目录。

## 发布前检查

- 不要把 `node_modules/`、`dist/`、`.npm-cache/` 提交到 Git。
- 不要把真实的 `资料库/收藏数据.json`、封面缓存、备份、Access Token 提交到 Git。
- Release 页面建议上传安装包和便携版 exe。
- 如果开发模式任务栏图标仍显示旧图标，取消固定旧图标、换新目录运行，或运行打包后的 exe。

## 开源声明

项目采用 MIT License。发布源码时请保留：

- `LICENSE`
- `NOTICE`
- `AUTHORS.md`

Copyright (c) 2026 AKISATO。
