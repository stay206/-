# GitHub 发布说明

建议仓库名：

```text
bangumi-vault
```

建议仓库描述：

```text
Bangumi 保管库：本地优先的 Bangumi 收藏备份桌面应用，支持桌面版和纯前端在线版。
```

建议 Topics：

```text
bangumi, backup, electron, desktop-app, anime, collection, vault
```

## 首次上传源码

如果使用 GitHub 网页端：

1. 创建公开仓库 `bangumi-vault`。
2. 解压 `Bangumi-Vault-v0.31.1-source.zip`。
3. 将源码文件上传到仓库根目录。
4. 不要上传 `node_modules/`、`dist/`、真实 `资料库/` 数据。

如果使用 GitHub CLI：

```bash
git init
git add .
git commit -m "Initial release v0.31.1"
gh repo create AKISATO57/bangumi-vault --public --source . --remote origin --push
git tag v0.31.1
git push origin v0.31.1
```

## 创建 Release

Release 标题建议：

```text
Bangumi 保管库 v0.31.1
```

Tag：

```text
v0.31.1
```

Release 附件建议上传：

```text
Bangumi-Vault-0.31.1-win-x64.exe
Bangumi-Vault-v0.31.1-source.zip
```

Release 说明可以直接复制 `docs/RELEASE_NOTES_v0.31.1.md`。
