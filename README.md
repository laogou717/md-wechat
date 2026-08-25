# MD公众号排版


[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![构建](https://github.com/laogou717/md-wechat/actions/workflows/ci.yml/badge.svg)](https://github.com/laogou717/md-wechat/actions/workflows/ci.yml)

面向公众号写作者的 Markdown 排版工具：左边写 Markdown，右边实时预览公众号效果，一键复制富文本，直接粘贴进公众号后台，样式不丢失。

<img width="5104" height="2390" alt="image" src="https://github.com/user-attachments/assets/5396e2d0-a417-48b7-9b01-848a4d24eeae" />

## 功能

- Markdown 实时渲染，编辑器与预览同步滚动
- 26 套排版主题一键换肤，悬停卡片即可实时试看；每套主色可自定义，部分主题的辅色可单独调整
- 字号、字体可调，支持按主题覆盖自定义 CSS
- 图片画廊三种模式：**拼贴**（主图 + 右列裁切填充，拖拽边界自由微调、底边始终齐平）、**网格**（1:1 / 4:5 / 3:4 统一裁切，公众号后台实测支持）、**单列**
- 剪贴板/拖放/文件选择三种方式插入图片，字节存本地 IndexedDB，文档只留短引用，复制到公众号时自动还原
- 视频处理：本地视频预览可播放；复制时 ≤7.5MB 的视频内联带走（按公众号正文 10M 上限反推），更大的自动转为带文件名的占位卡，粘贴后在公众号后台插入真视频（视频不像图片会被微信转存，必须走后台上传转码审核——平台限制，非工具问题）
- 外链转脚注（可选开关）：公众号不支持外链，粘贴后链接会失效；开启后所有外部链接自动搬到文末【参考资料】并配 [n] 角标，网址以纯文本保留可查可搜，微信内链（mp.weixin.qq.com）保持可点击
- 代码块高亮（22 种常用语言，样式全部内联）、表格、嵌套引用、分割线等完整语法支持
- LaTeX 公式：支持 `$...$`、`$$...$$`、`\(...\)`、`\[...\]`，本地渲染为自包含 SVG；公式继承主题及所在卡片的文字颜色，适配深色背景并可逐元素微调
- 右侧预览支持白天 / 夜间阅读环境切换；26 套模板均生成语义化深色变体，不反转图片，预览模式不会污染复制结果
- 富文本提供白天版 / 夜间版两种复制结果：主按钮跟随当前预览模式，也可从下拉菜单直接指定版本
- 满屏 / 手机 / 桌面三种预览比例，手机样机框接近真机效果
- 多文档管理、回收站、本地自动保存
- 导入 / 导出 Markdown，随时备份文章
- 顶栏「?」查看快捷键与操作提示（复制排版、保存、图片拖拽、段落定位等）

## 技术栈

- Vue 3 + Vite
- CodeMirror 6（编辑器）
- markdown-it + highlight.js + MathJax（Markdown、代码高亮与自包含 SVG 公式，复制时样式全部内联）
- 无后端：全部数据保存在浏览器本地（localStorage / IndexedDB），静态托管即可运行

## 安装与启动

### 方式一：一键启动（推荐给小白）

- **macOS**：双击 `start.command`（首次如提示无法打开，在文件上右键 → 打开）
- **Windows**：双击 `start.bat`（如弹出 SmartScreen，点「更多信息 → 仍要运行」）

脚本会自动检查 Node.js；如果电脑没装，会从国内镜像下载免安装版放到项目目录（`.node-runtime/`，不污染系统），然后装依赖、起服务、开浏览器，全程无需管理员权限。

### 方式二：手动

需要 Node.js 18 及以上。

```bash
npm install   # 安装依赖
npm run dev   # 启动开发服务器，默认 http://localhost:5173
```

## 构建与测试

```bash
npm run build    # 构建生产版本到 dist/
npm run preview  # 本地预览构建产物
npm test         # 运行测试（node --test）
```

## 使用

1. 在左侧编辑器粘贴 Markdown，或点击「导入 Markdown」选择本地 .md 文件
2. 在右侧主题库选择主题，按需调整主色、辅色、字号
3. 点击「复制富文本」，到公众号后台粘贴即可发布

### 公式写法

```markdown
行内公式：$E=mc^2$ 或 \(E=mc^2\)

$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx=\sqrt{\pi}
$$

\[
e^{i\pi}+1=0
\]
```

公式在浏览器本地转换，不会上传到第三方服务。复制结果是路径完全内嵌的 SVG，
不依赖外链字体；如需调整某套主题中的公式间距，可在「逐元素样式微调」中分别修改行内公式和块级公式。

## 浏览器要求

推荐 Chrome / Edge，Safari 也能正常使用全部功能。

## 数据与隐私

- 纯前端应用，**无后端、无埋点、无账号体系**：文章、图片、设置全部保存在浏览器本地（localStorage / IndexedDB），不上传任何服务器
- 可选的「图床」功能（SM.MS / GitHub / 自定义接口）需要你主动配置 Token，凭据同样只存本机浏览器（明文 localStorage），仅在你手动触发上传时才会把媒体发往对应服务
- 关闭浏览器标签页或清理站点数据即可彻底抹除所有内容

## 在线版（可选）

纯静态产物（`npm run build` 输出 `dist/`），部署到 Cloudflare Pages、Vercel 等任意静态托管即可。仓库自带的 GitHub Actions 工作流会在每次 push / PR 时自动跑构建与测试。

## 项目地址

https://github.com/laogou717/md-wechat

## License

[MIT](LICENSE)
