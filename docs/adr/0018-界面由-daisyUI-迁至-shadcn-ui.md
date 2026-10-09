# 界面由 daisyUI 迁至 shadcn/ui

界面原型是按 Tailwind 手写的高保真稿，视觉是赤红的暗色影院风（另一份设计稿给了它的亮色配对）；而实际实现用的是 daisyUI 的内置 `light`／`dark` 主题，是中性灰。两者不是同一个视觉，靠调 daisyUI 的主题变量补不上这个差距——原型里的发光阴影、渐变进度条、悬停抬升、深酒红底与浅绯文字这套语言，需要组件源码可改，而不是一组可覆盖的类名。

## 取舍

**daisyUI 给的是成体系的语义类与开箱主题**：`btn btn-primary btn-soft`、`modal`、`drawer`、`alert-*` 一行就是一个完整组件，主题只需两套变量。代价是一整套运行时契约被它绑住，而且这些契约已经写进了文档：抽屉的位移来源是它的 `translate` 过渡而不是 `transform`（[抽屉滑动的位移来源](0007-抽屉滑动的位移来源与去掉-GSAP.md)）、模态靠 `:checked` 与 `[open]`、暗色主题的滚动锁改的是 `--page-scroll-bg`、`alert-*` 的配色类必须是完整字面量否则不生成样式。

**shadcn/ui 给的是可改的源码加 Radix 的无障碍原语**：焦点陷阱、`aria-modal`、`inert`、关闭时的焦点归还都由 Radix 承担，组件本体是仓库自己的代码，想改成什么形状都行。代价是自持这些代码，以及一组新依赖：`radix-ui`、`class-variance-authority`、`clsx`、`tailwind-merge`，动画改引 `tw-animate-css`（Tailwind 4 下 `tailwindcss-animate` 已不推荐）。

两条路都成立。选后者的理由是视觉需要落到组件内部，而不只是落到变量上。

## 它改写的既有约定

- `开发指南.md`：「界面实现优先使用 daisyUI 现有组件」那条整体失效，按钮规范整节（全是 `btn-*` 类名与语义色映射）改写成变体名，`select` 类必须加在原生 `<select>` 上的约束失效——shadcn 的 `Select` 是 Radix 的非原生实现
- `style.css` 三处覆写 daisyUI 内部选择器的补丁：治 macOS 标题栏变灰的 `--page-scroll-lock`、`.drawer-side` 的 reduced-motion 降级、`.video-card` 的过渡重述（后两者随 0006／0007／0008 一并处理）
- `dark:` 自定义变体**继续绑定 `[data-theme='dark']`**，不改 `theme/ThemeSetting` 与两个 HTML 入口。shadcn 默认用 `.dark` 类，改它等于白改三处
- 设计 token 以 shadcn 的语义变量为唯一真源，原型里的品牌色映射进去，而不是两套并存。shadcn 默认没有 success／warning／info 三槽，需扩展——现有语义色与原型都在用它们

## 顺带修正的界面约定

这三条本身没有取舍价值，但都推翻了成文的东西，记在这里免得后来者去找旧论证：

- **共享状态指示由「导航上的一枚 7 像素圆点」改为「头部右簇的文字胶囊」。** 依据是原型：九页的头部右簇都画着「圆点 + `LAN 局域网在线`」。原型在导航「共享」上**也**照画了那枚圆点（`absolute -top-1 -right-2.5`，挂在文字自身的盒上），两处指示的是同一件事，本次只留右簇这一处。要说清楚的是这**不构成对成文论证的推翻**：`界面原型.md:28` 反对的是把指示器排进导航行（行内会落在文字垂直中线，那是句号的位置），而胶囊在头部右簇、不在导航行，那段论证的落点仍然成立——它只是不再适用。原方案附的三档对比度实测是针对圆点的描边与填充的，随圆点一并作废
- **聚焦环统一取主色。** 原型里青色 `rgba(0,240,255,0.35)` 与红色并存，是稿子未收敛的痕迹
- **圆角基准统一 `.5rem` 且亮暗共用。** 两份设计稿给了不同的基准（`.25rem` 与 `.5rem`）；若按主题分别取值，组件尺寸会随主题跳动

## 它作废了哪几篇 ADR 的哪一部分

0002（通知的类型配色与停留共存）、0005（点击反馈改用短提示）、0006／0007（抽屉）、0008（视频卡片的悬停动效）、0009（上次播放标记记在会话里并浮在缩略图角上）——这几篇的**理由仍然成立**，作废的是它们借用的实现手段：配色载体、`animate-none` 压掉的 daisyUI 入场动画、抽屉的 `translate` 过渡、`.video-card` 的过渡重述、`badge badge-sm badge-neutral` 这个类名。

其中抽屉那篇要重新论证：Radix 的过渡走 `transform` 而非 daisyUI 的 `translate` 属性，0007 记的缺陷（GSAP 的 `transform` 与 daisyUI 的 `translate` 叠加导致「滑过头再闪回」）正是同源的坑，换机制时不能重蹈。

## 明确不采用的

- **Radix `ScrollArea`**：它会自绘滚动条，与现有的滚动条占位契约冲突（`scrollbar-gutter: stable` 设在真正的滚动元素上、补偿 `max(0px, 20px - 原生槽宽)`）。保留自家实现
- **sonner**：不支持现有通知契约要的东西——倒计时细线用 `bg-current`、非错误通知全局只留最新一条
- **Material Symbols**：原型用的是它，继续用已在依赖里的 `lucide-react`
- **Manrope 与 JetBrains Mono**：原型稿的 CDN 字体。两份设计稿都写全族 Space Grotesk，等宽用系统栈 `ui-monospace, SFMono-Regular, Menlo, monospace`

## 实施状态

**已实施**（#58–#73）。shadcn/ui 原语与 `cn.ts` 落在 `frontend/src/shared/ui/`，设计 token 以 `style.css` 的 shadcn 语义变量为唯一真源（`check-tokens.mjs` 与两份设计稿对照，并断言 daisyUI 的 `@plugin`、`--page-scroll-lock`、`drawer-side`、`--video-card-shadow` 都不在）；`package.json` 已移除 `daisyui`，换入 `radix-ui`、`class-variance-authority`、`clsx`、`tailwind-merge`、`tw-animate-css`。本文「它改写的既有约定」「顺带修正的界面约定」「明确不采用的」各条都已按写下的方向落地：`开发指南.md` 第 46 条改为复用 `shared/ui/` 原语、按钮规范按变体名重写、下拉选择框改用 Radix `Select`；共享状态改为头部右簇的文字胶囊（`ShareStatusPill`，导航上那枚 7px 圆点已删）；聚焦环取主色、圆角统一 `.5rem`（均由 `check-tokens.mjs` 断言）；`ScrollViewport`、`lucide-react` 与系统等宽栈保留，`sonner` / Material Symbols / Manrope / JetBrains Mono 未引入。组件契约见 [界面通用组件清单](../界面通用组件清单.md)；ADR 0006／0007 的抽屉以 Radix `Sheet` 重做，位移来源换成 `animate-in`/`animate-out` 的 `transform` 关键帧，焦点陷阱与滚动锁由 Radix 承担（见 `shared/Drawer.tsx`）。

收口（#73）另已把本文在各文档里点名的既有约定改写完，逐条见 [界面通用组件清单](../界面通用组件清单.md) §1 与 §7。
