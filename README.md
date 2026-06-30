# Photolog

一个部署在 GitHub Pages 上的纯静态照片展示网页。主页面以黑灰色调为底、隐没渐变转场为韵，每张照片随机展示 9 秒；后台管理页通过 GitHub Personal Access Token 登录，可上传图片并自动从 EXIF 解析拍摄日期与器材。

## 文件结构

```
.
├── index.html       # 主展示页（访客浏览）
├── admin.html       # 后台管理页（上传/编辑/删除）
├── styles.css       # 共用样式
├── main.js          # 主页逻辑：轮播、转场、元数据
├── admin.js         # 后台逻辑：登录、EXIF、上传、编辑、删除
├── photos.json      # 元数据存储（初始为空数组）
├── .nojekyll        # 禁用 Jekyll，确保 photos/ 等目录原样输出
└── README.md
```

## 部署步骤

### 1. 创建仓库并上传文件

在 GitHub 新建一个仓库（public 或 private 均可，private 也能用 Pages，但需要 Pro 账号），将以上所有文件传到仓库根目录的 `main` 分支。

### 2. 开启 GitHub Pages

进入仓库 **Settings → Pages → Source**，选择 `Deploy from a branch`，分支选 `main`、文件夹选 `/ (root)`，保存。约一分钟后会得到访问地址：

- 用户/组织页：`https://<owner>.github.io/<repo>/`
- 项目页：`https://<owner>.github.io/<repo>/`

### 3. 创建 Personal Access Token

进入 GitHub → 头像菜单 → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**：

- **Repository access**：选 `Only select repositories` → 勾选刚才那个仓库
- **Permissions → Repository permissions → Contents**：设为 `Read and write`
- **Expiration**：按需设置（过期后需重新生成）
- 生成后复制 `github_pat_...` 开头的字符串，**只显示一次**

### 4. 进入后台

浏览器打开 `https://<owner>.github.io/<repo>/admin.html`，填入：

| 字段 | 说明 |
|------|------|
| Token | 刚才生成的 PAT |
| Owner | 仓库所有者（用户名或组织名） |
| Repo | 仓库名 |
| Branch | 默认 `main` |

登录后即可拖拽上传图片。Token 仅存于浏览器 `sessionStorage`，关闭标签页即失效，不会上传到任何服务器。

### 5. 体验主页

打开 `https://<owner>.github.io/<repo>/`，照片会以随机顺序循环展示，每张 9 秒，淡入淡出转场。

## 功能说明

**主展示页**
- 黑灰色径向背景，中央 contain 居中显示照片
- 双层交叉淡入淡出（1.4s），每张停留 9s
- 照片下方一行：`日期 · 器材 · 注释`，缺省段自动省略
- 桌面端右下角细线进度环；移动端顶部 1px 进度线
- 列表播完后自动重新洗牌

**后台管理页**
- Token 登录，sessionStorage 自动恢复会话
- 拖拽或点击选择图片，支持多选
- exifr 自动解析 `DateTimeOriginal` / `Make` / `Model` / `LensModel`
- 日期、相机、镜头、注释均可手动修改；注释可留空
- 网格陈列已有照片，悬浮显示编辑/删除按钮
- 编辑通过模态框修改元数据并写回 `photos.json`
- 删除会同步移除仓库中的图片文件与元数据条目

## 数据流

```
访客 → 主页 → fetch photos.json → 随机洗牌 → 9s 轮播
管理员 → admin.html → 输入 Token → 校验仓库
       → 选图 → exifr 解析 → 编辑表单
       → PUT /contents/photos/{filename}  (图片入库)
       → GET photos.json (拿 sha)
       → PUT /contents/photos.json (追加元数据)
```

## 安全提示

- Token 仅存在当前标签页的 sessionStorage，关闭即失效
- 不要把已登录的后台页面分享给别人
- Fine-grained PAT 仅授权目标仓库的 Contents 读写权限，泄露后影响面仅限该仓库
- 若怀疑 Token 泄露，立即在 GitHub Token 管理页撤销并重新生成

## 自定义

- 主题色：编辑 `styles.css` 顶部的 CSS 变量（`--bg` / `--accent` 等）
- 停留时长：编辑 `main.js` 顶部的 `DURATION`（毫秒）
- 字体：替换 `index.html` / `admin.html` 中的 Google Fonts 链接与 `--serif` / `--sans` 变量
