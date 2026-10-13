# 工具条脱离卡片，控件改用 `--field`

用户给了一张暗色主题下视频库页的截图，红框圈住筛选工具栏那一整块（搜索框、两个下拉、两个图标按钮、视图模式分段条），要求：

> 去掉页面上方操作区域的外部容器边框、背景、留白，同时调整内部操作组件比如输入框、搜索等颜色使其和整个页面的背景能区别开

两件事分开看都简单：外层那圈是 `LibraryToolbar` 自己的一行 class，控件那半边是 `bg-background` 换成另一个 token。难的是第二件之前必须有个决定——**拆掉卡片之后，控件靠什么留在视野里**。那张卡片原本正是控件能读出来的理由：控件填的是 `--background`，与卡片底 `--card` 不同，所以「框里深一点的东西」是输入框；卡片一去，控件与页面同色，`bg-background` 就变成了一层什么也不表达的填充。

## 一、用户在岔口上的选择

三个选项都摆了出来（浅填充 + 保留细边 / 纯填充去边框 / 只去容器控件不动），用户选了第一个：

| 岔口 | 选项 | 用户选择 |
|---|---|---|
| 控件靠什么与页面区分 | 浅填充 + 保留细边 / 纯填充去边框 / 只靠现有描边 | **浅填充 + 保留细边** |

这条选择的分量在于它同时定了两件事：控件**仍是有描边的**（`border-input` 不动），以及它**多了一层底色**（新的 `--field`）。第三项被否决意味着「只靠 `border-input` 那圈线」不算数——用户在截图里看到的就是那个状态，并明确说它和页面区分不开。

## 二、改了什么

**`frontend/src/style.css`** 新增一对 token，`--field`：

| | 值 | 出处 | 对页面底 |
|---|---|---|---|
| 亮色 | `#f1f5f9` | `surface-dim` | `#faf8ff`，**更暗** |
| 暗色 | `#1a1c20` | `surface-container-low` | `#111317`，**更亮** |

两个主题往相反方向走，因为两份设计文档各自把「字段」放在页面的另一侧。**都不是 `--muted`**：亮色的 `--muted` 是 `#fff1f2`，比页面**更亮**，控件会化进背景里——正是这一轮要修掉的那个失败。`--color-field: var(--field)` 一并加进 `@theme inline`，于是 `bg-field` 是一个正常工具类。

**表里亮色那两个值后来被换掉了**——页面底与字段一起改成用户另指的两个值（`#f5f5f5` / `#ebebeb`），见 [ADR 0029](0029-亮色改用用户指定的中性灰底与字段色.md)。下面「实测」一节里亮色那一列的读数因此是**当时的**，不是今天的。

**`features/library/LibraryToolbar.tsx`** 那一行由 `flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3` 收成 `flex flex-wrap items-center gap-3`：边框、背景、内边距三样一起去掉，`data-slot="library-toolbar"` 与 `flex-wrap` 都留着。

**四个控件各自带上一层填色**（都在调用点覆盖，不动 `shared/ui` 的默认值）：

| 文件 | 落点 | 改动 |
|---|---|---|
| `features/library/SearchInput.tsx` | `Input` | 加 `bg-field`；键盘提示由 `bg-muted` 改 `bg-background` |
| `features/library/FolderSelect.tsx` | `SelectTrigger` | 加 `bg-field` |
| `features/library/SortSelect.tsx` | `SelectTrigger` | 加 `bg-field` |
| `features/library/ViewModeSwitch.tsx` | `ToggleGroup` 轨道 | 加 `bg-field` |
| `features/library/DirectoryActions.tsx` | `iconOnly` 形态的 `Button` | `className` 由 `undefined` 改 `'bg-field'` |

**键盘提示必须离开 `--muted`**：暗色主题下 `--muted` 就是 `#1a1c20`，与 `--field` 同值，那枚 `kbd` 会变成 `--field` 上的一块空白矩形。改 `bg-background` 后它在两套主题下都从字段底上退开（亮色更亮、暗色更暗）。工具栏目前不传 `kbdHint`，这条是为 `SearchInput` 的另一个形态留的。

**改的都是调用点，不是通用组件。** `Input` 还被 `SpaceDialog` 用（对话框里的字段照旧 `bg-background`），`SelectTrigger` 还被设置页的语言选择用（照旧），`ToggleGroup` 的默认轨道也照旧——脱离卡片的只有工具栏这一处，token 不该替别处做决定。`DirectoryActions` 同理只改 `iconOnly` 那一支，设置页的带文字形态仍是 `outline` 自己的底色。

`SharePage` 的 `actions` 槽放的是 `primary` / `secondary` 实心按钮，与填色无关，一行没动。

## 三、实测（CDP 驱动真实页面，1280 视口，两套主题）

改后在无头 Chrome 里量到的读数：

| | 暗色 | 亮色 |
|---|---|---|
| 页面底（`body`） | `rgb(17,19,23)` | `rgb(250,248,255)` |
| 工具栏 边框 / 内边距 / 背景 / 圆角 | **0px / 0px / 透明 / 0px** | 同左 |
| 搜索框底 | `rgb(26,28,32)` | `rgb(241,245,249)` |
| 两个下拉底 | `rgb(26,28,32)` | `rgb(241,245,249)` |
| 视图模式轨道底 | `rgb(26,28,32)` | `rgb(241,245,249)` |
| 两枚图标按钮底 | `rgb(26,28,32)` | `rgb(241,245,249)` |
| 选中段底（`--secondary`） | `rgb(42,45,51)` | `rgb(254,205,211)` |
| 描边（`--input`） | `rgb(37,40,47)` | `rgb(203,213,225)` |

**左右对齐是这一轮的主要几何结果**：工具栏左缘 x=21，与内容区左缘（`main` 的 `padding-left`）以及下方「本库共 0 个视频」那一行的左缘 x=21 逐像素相同。改前那 12px 的 `p-3` 让整条工具栏内缩，与列表列不齐。

**行高由 60 掉到 37**：改前那 60 是 `ViewModeSwitch` 的 37 加上下各 12 的 `p-3`；控件本身（`h-9` = 36 与轨道的 37）一点没动。四个列表页的工具栏都在 y=71、高 37，逐像素一致。整页内容因此上提 23px。

悬停两个下拉时底色不变（`SelectTrigger` 没有 hover 样式，`outline` 按钮才有 `hover:bg-accent`），与改前一致。

## 四、代价

**控件与页面之间只剩 `--field` 这一层差。** 亮色下 `#f1f5f9` 对 `#faf8ff` 是 9/5/6 级，比暗色那对（9/9/9）更轻——两套主题的分离度**不等强**，亮色那一侧是这一轮里最薄的一处。再薄就只有描边了，而那正是被否决的第三项。（**这一条后来不再成立**：亮色换成用户那张截图的两个值后是 10/10/10 对 9/9/9，见 [ADR 0029](0029-亮色改用用户指定的中性灰底与字段色.md)。）

**工具栏从此没有自己的可点区域。** 整条工具栏与页面同底，`gap-3` 之间的空白属于页面；改前那些空白是卡片的一部分。指针落在两个控件之间时，改前读作「卡片上」，现在读作「页面上」。

**`--field` 是这一轮新加的第三个「表面」token**（此外是 `--card`、`--accent`），而它与 `--muted` 在暗色下同值（`#1a1c20`）。两份值相同、语义不同，将来调其中一个要记得另一个不必跟着动。

## 它推翻了什么

`docs/界面通用组件清单.md` §7 加一行：**筛选工具栏是一张卡片（`rounded-xl border bg-card p-3`）**，出自 `开发指南.md` 按钮样式一节的工具栏一句。整块推翻。

**原型不回溯改稿**，偏离记在清单 §7，与 ADR 0025 同一处台账。

## 实施状态

**已实施。**

- `frontend/src/style.css` —— 新增 `--field`（亮 `#f1f5f9` / 暗 `#1a1c20`）与 `--color-field` 映射；亮色那个值连同页面底已由 [ADR 0029](0029-亮色改用用户指定的中性灰底与字段色.md) 换为 `#ebebeb` / `#f5f5f5`。
- `frontend/src/features/library/LibraryToolbar.tsx` —— 去掉容器的边框、背景、内边距；文件头注释改写。
- `frontend/src/features/library/{SearchInput,FolderSelect,SortSelect,ViewModeSwitch,DirectoryActions}.tsx` —— 五处调用点加 `bg-field`；`SearchInput` 的 `kbd` 改 `bg-background`。
- 文档：`界面通用组件清单.md` §7；`开发指南.md` 工具栏一句。

门禁：`npm run check` 通过（`style.css` 432 行，500 行上限是这条 check 的一部分），`npm test` **82 文件 472 用例**全绿，`npm run build` 通过——产物里 `bg-field{background-color:var(--field)}` 与两套主题的 `--field` 三条都在。

真实浏览器（无头 Chrome + CDP，Node 22 自带 `WebSocket` 手搓，脚本在仓库外）里两套主题各出图：整页、以及悬停两个下拉后的同一屏。读数即上表。
