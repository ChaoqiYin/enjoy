# 设置页改用 shadcn 的 sidebar 与 Rubber Segment

设置页这一轮换了两个控件：主题的三态从 `Select` 换成 react-bits 的 `RubberSegment`，左列从 `Tabs` 的纵向模式换成一个**按需移植的** shadcn `Sidebar`。

两件事分开记，因为它们的理由不一样。前者是观感：用户点名要那个会滑的手柄。后者是这块位置本身该长什么样 —— 一列有自己底色的面板，而不是一条穿了纵向 `Tabs` 衣服的菜单。

## 一、主题：为什么是 vendored 的 Rubber Segment

用户点名要 react-bits 的 Rubber Segment，也就是说这个选择不是论证出来的，是点名的。本仓能做的是把它接对。

**它是 vendored 的，不是依赖。** 与 `border-glow.tsx` 同一套做法：react-bits 是 copy-paste 库，没有包可装，所以文件是抄进来改的。它的许可是 MIT **加** Commons Clause License Condition v1.0，那条附加条件允许把它作为应用的一部分使用（含商用），但禁止转售、再许可或再分发组件本身 —— 所以这个文件不覆盖在本仓的 MIT 之下，`NOTICE` 里为它单列一条。文件头记了四条偏离（颜色默认值改成 token、去掉 `'use client'`、`ResizeObserver` 不留存在性守卫、具名导出而不是 `React.FC`）。

**无障碍没有净减少。** 这是接它时唯一需要守住的东西。它渲染的是 `role="radiogroup"` 装三个 `role="radio"`，带 `aria-checked`、单一 Tab 停靠点、四个方向键加 Home/End —— 与被它取代的 `RadioGroup` 逐条对齐。也就是说这一换**换掉的是观感，不是能力**：多出来的是会伸缩的手柄，少掉的是零。这条写在 `ThemeSetting.tsx` 的注释里，因为后来者最容易怀疑的正是这里。

**颜色只传两个，其余用默认。** 轨道与未选中的字保留组件的默认值（`--background` 与 `--muted-foreground`），手柄与选中的字传给组件的是 `--secondary` 与 `--secondary-foreground` 而不是它自己的 `--accent` 与 `--accent-foreground`——理由与代价在 §五。不能写字面值的理由不止「暗色下会错」：**没有任何一对语义 token 会自己跟着主题翻转** —— `--muted` 在亮色下坐在 `--card` 之下、在暗色下坐在它之上，按它配色会在两套主题里各错一次。

**边框用 `outline` 而不是 `border`。** 组件用 `getBoundingClientRect` 量轨道、再从内衬盒里缩出手柄，而 `border` 会缩小那个盒 —— 换成 `border` 就等于把手柄与分段错开一个像素。`outline` 不参与布局，量到的还是上游写的那套数。

**聚焦环由调用点改色，并补一句 `outline-solid`。** 组件把环画在 `--rs-thumb` 里（`focus-visible:[outline-color:var(--rs-thumb)]`），那是作者可以假设手柄是强调色的写法；手柄改成一款面色之后，那是一个面色环画在面色轨道上 —— **两套主题都弱**，亮色那份也一样。所以调用点把它改成 `--ring`，那是全仓其它可聚焦的东西画的颜色。

改色时量出一个**上游**缺陷：分段带 `outline-none`，它把 `--tw-outline-style` 设成 `none`，而 `focus-visible:outline-2` 的 `outline-style` 正是取自这个变量 —— 于是上游的聚焦环设了宽度却从不画（实测 `2px none`）。所以调用点还要说一句 `focus-visible:outline-solid`。补上之后是 `2px solid`、亮 `rgb(225,29,72)` / 暗 `rgb(255,51,75)`、离分段 3px。这条记在这里是因为它是上游的、不是移植时弄坏的：将来更新这个 vendored 文件要重新确认。

**`RadioGroup` 原语与它的测试一并删掉。** 设置页是它唯一的调用点；留着一个没有调用点的原语，等于把「谁能被 import」这件事说大了。§4 那一行随之移除。

## 二、左列：为什么按需移植 shadcn 的 Sidebar

用户第一次要的是 react-bits 的 Branched Menu。做完、看了实际效果之后被否决 ——「菜单效果不怎么好」。所以这条路是**被看掉的，不是被论证掉的**：那个文件与它的测试已经删除。这一句写在这里，是因为「Branched Menu 去哪了」是后来者迟早会问的问题，而答案不在代码里。

**为什么不把上游整个搬过来。** 上游 `sidebar.tsx` 727 行，它是一个 **app shell**：收起态存在 cookie 里、手机宽度下换成抽屉、还带着 provider、触发器、拖拽把手和主内容区的内衬。这些没有一样属于页面内部 —— 设置页不滚动（`开发指南.md:256-258`），侧栏没有可收起的去处；这是桌面应用，没有手机那一档。所以只带这一个位置用得到的形态：**上游自己叫 `collapsible="none"` 的那一种**，207 行、一个文件。

**没有 Provider，也就没有宽度 token。** 上游靠 provider 在 style 里写 `--sidebar-width: 16rem`、类名用 `w-(--sidebar-width)`。这里没有 provider，宽度由调用点定：`SettingsSidebar` 传 `w-full`，落在设置页那个 `lg:w-64` 的列里。`lg:w-64` 在 `html { font-size: 14px }` 的基准下是 16rem = **224px**，恰好等于上游的 `SIDEBAR_WIDTH` —— 实测面板宽 224px，**与改前逐像素相同**，这一轮没有动它。

**砍掉 `SidebarContent` 与 `SidebarGroup`。** 上游 `SidebarContent` 自己不带内衬、`SidebarGroup` 带 `p-2`；这里只有一个分组、页也不滚动，两个壳就是两个什么都不做的盒子，面板自己带内衬（实测 7px）。这是移植时最容易留下的一处多余缩进。

**两级用一条竖线表达。** 「通用」是可展开的父项，三个子项走 `SidebarMenuSub` 的 `border-l`。为什么保留两级而不是拍平成四项：那三项都是「通用」，拍平就把这层意思丢在排版里了。

**三处元素差异**，都是刻意的：

1. 两种行都渲染 `<button>`。上游的行是 `<a>` 带一个 `asChild` 逃生口，因为它的行在导航；这里的行切换的是同一页里的面板。一个没有 `href` 的 `<a>` 比「有差异」更糟：它不可 Tab、不响应回车，却仍然自称链接。
2. 行上说 `outline-none`，上游说 `outline-hidden`。两者只在强制色彩模式下有区别（上游那个会给系统留一条不可见的外框去重绘）。仓库里 `outline-none` 有 24 处、`outline-hidden` 0 处，所以跟仓库走 —— 文件里标明了这一行就是将来该改的地方。
3. `asChild` / `Slot` 一并去掉（两个按钮组件都是）。两种行都只渲染自己的元素，没有要把语义让给子节点的调用点；去掉之后这个文件根本不 import `radix-ui`。

**这个文件按本仓的 shadcn 惯例写，所以不带来源头、不带许可、不进 `NOTICE`。** `shared/ui/` 下二十多个 shadcn 原语（`card`、`table`、`popover`、`sheet`、`tooltip`……）一律如此 —— shadcn 是 MIT，本仓一直把它当自研原语。只有 react-bits 来源的文件才交代来源，因为 Commons Clause 要求署名。同一个目录里两套惯例，界限是**许可**，不是「抄了多少」。

**可访问名挂在 `<ul>` 上，不是 `<nav>`。** 页头已经有一个 `role="navigation"`，而 `app/routes.test.tsx` 断言 `getByRole('navigation')` **唯一** —— 侧栏再放一个 `<nav>` 会从远处把那条测试打红。所以用上游本来就有的 `ul`/`li`，`aria-label={t('settings')}` 挂在唯一的那个 `<ul>` 上，得到一组**有名字的 `list`**（实测 `listName = '设置'`）。「一组有名字的选择」这条立场保住了，只是换了个角色。

**当前项的标记有两个，都由同一个 prop 派生。** `data-active` 给眼睛 —— 下面的类名是照它写的，上游也这么写；`aria-current="true"` 给读屏之外的一切。上游只设第一个，第二个是本仓借 `MainNav` 的先例加的，加在一起是为了两者不会各自漂移。取 `"true"` 而不取 `"page"`：它选的是一页里的一个面板，不是一个地址。

**角标不在按钮的可访问名里了。** 上游 `SidebarMenuBadge` 是按钮的**兄弟节点**（绝对定位，靠 `peer-data-[size=…]/menu-button:` 跟着行高走），所以「视频目录 2」这个名字变成了「视频目录」+ 旁边的一个 2。计数仍在那条 `<li>` 的文字里，读屏走过去读得到，只是不再算进控件名。这是本轮一个可感知的无障碍变化，如实记下来。

## 三、唯一的能力减少：键盘

上一轮用户为 Branched Menu 选的是「在 vendored 版里补齐方向键、单一 Tab 停靠点和焦点环」；这一轮换成 shadcn 的 Sidebar 之后，用户改选「照 shadcn 原样」。于是：

- 那套方向键、单一 Tab 停靠点，连同 `role="tree"`，**不再有**。上游 shadcn 的侧栏本来就没有方向键。
- 换来的是一列普通的、每一个都能 Tab 到的 `<button>`，靠 `focus-visible:ring-2` 看得见。实测四个可见项的 `tabIndex` 全是 0。

净减少是**「一次要走更多次 Tab」，不是「走不进去」**。这是本轮唯一的能力减少，写在这里以便将来回看时不必重新推一遍。

## 四、面板的样子：底色、动画、高度

**底色是新加的一组 token，六个，全部指向既有语义 token。** `--sidebar` 取 `--card`（照 `_5` 的 `bg-surface-card`）、`--sidebar-accent` 取 `--accent`、`--sidebar-border` 取 `--border`，其余同理。**只写在 `:root` 一份**，值是 `var()`：CSS 自定义属性在使用点求值，`[data-theme='dark']` 下这一行自己就取到暗色那份 —— 与 `--glow-color`、`--dot-color` 同一手法，不需要第二份，也不需要任何东西去发现主题变了。

`--sidebar-accent` **刻意不是 `--primary`**：一行被选中时填的是「被选中项」的颜色，红色留给每屏那一个着力的动作。它指向 `--secondary` 而不是 `--accent`，理由与代价见 §五。

**面板感主要来自边框，不是底色。** 实测两个主题下，面板与页面底色差得很近：

| | 面板 | 页面 | 通道差 |
|---|---|---|---|
| 亮色 | `rgb(252,252,253)` | `rgb(250,248,255)` | (2, 4, 2) |
| 暗色 | `rgb(20,23,29)` | `rgb(17,19,23)` | (3, 4, 6) |

这两个值就是 `--card` 与 `--background` 在全仓其它地方本来就有的那点差。所以真正划出边界的是 `--sidebar-border` 那一圈（亮 `rgb(226,232,240)`、暗 `rgb(56,59,66)`) 与「不透明地盖住窗口点阵」这两件事。**这是本轮交给用户看图定的第一处。**

**面板不带 `overflow-hidden`**，尽管它其余部分照抄 `card.tsx`：这里没有任何东西会溢出。行上的 `focus-visible:ring-2` 是往外画的 `box-shadow`（实测 2px：亮 `rgb(225,29,72)`、暗 `rgb(255,51,75)`，都是 `--ring`），它落在行的盒之外 —— 今天够得到面板边缘而不被切，靠的是面板自己那 7px 内衬。裁一刀就等于把焦点环的余量交给内衬去管，两个数本来没有理由认识彼此。上游的侧栏也没有它。

**展开与收起没有动画**：上游 shadcn 的侧栏本身不带折叠动画（它的示例靠 Radix `Collapsible` 才有）。这里是瞬时展开/收起（实测面板高 160px ↔ 76px）。要不要补动画，是**交给用户看图定的第二处**。

**面板按内容撑高，不撑满整列**（实测 160px，同列右侧的卡片高得多）。`_5` 画的就是一块贴内容高的卡片，所以这是默认；父列被外层 flex 行拉伸到满高，写 `h-full` 会让面板把标题那一段也算进去而溢出。**这是交给用户看图定的第三处。**

## 五、选中面的颜色：用户看出来的一个错

用户在暗色下看实际应用之后报：「暗色时这个单选看起来完全区分不出」。

**根因不在那个控件，在一条规则。** 本仓此前把「被选中 / 当前的那一块」统一画成 `--accent`（`surface-elevated`）——主题分段条的手柄、`--sidebar-accent`、`toggle-group.tsx` 的选中段，三处都是。这条规则在亮色下成立：`--accent` 是 `#ffe4e6`，坐在近白页面上是一块清楚的粉。在暗色下不成立：`--accent` 是 `#1a1e26`，只比 `#111317` 的页面高 9~15 级 —— 那是**悬停水洗**的量级，是「指针扫过时注意到一下」就够的强度，不是「没有任何指针也要读出来」的强度。分段条在暗色下于是只剩文字色在变，而它的文字由手柄内部的镜像层单独画（`getComputedStyle(button).color` 三档读出来一模一样），看上去就是「完全区分不出」。

**改成 `--secondary`（`surface-container-high`），三处落点一起改**，因为错的是一条规则：主题分段条的手柄、`--sidebar-accent`（左列的悬停与当前项）、`ToggleGroup` 的选中段。它在两套主题下都是往上再走一档的那块面：

| | 主题条的轨道 → 选中块 | 侧栏的面板 → 当前行 |
|---|---|---|
| 亮色 | `rgb(250,248,255)` → `rgb(254,205,211)`，差 (4, 43, 44) | `rgb(252,252,253)` → 同上，差 (2, 47, 42) |
| 暗色 | `rgb(17,19,23)` → `rgb(42,45,51)`，差 (25, 26, 28) | `rgb(20,23,29)` → 同上，差 (22, 22, 22) |

三处的文字色都不用动：`--secondary-foreground` 与 `--accent-foreground` 在亮暗两套下的值本来就完全相同（都取 `on-surface`），但**传的是 `--secondary-foreground`** —— 手柄换了一款面，跟它配对的前景就该跟着换，哪怕值一样。

**代价如实记：亮色下这三处也跟着深了一档**（`#ffe4e6` → `#fecdd3`）。修暗色必须动那个共用的 token，而两套主题共用一个 token 就意味着一起动 —— 这正是「一个错」的由来。亮色下结果仍是同一色系的粉块（实测与截图都过了），要不要收回去由用户定。

**放弃的两条路。** 一是给手柄加一圈 `--primary` 的边 —— 原型 `_5` 的选中档正是 `border-[#ff334b]/50` 加一圈红晕，所以这条最像原型；但实测两套主题下都太吵，亮色下更像一个告警框，且与「红色留给每屏那一个着力的动作」这条立场冲突。二是按主题分别声明 `--sidebar-accent`（暗色指 `--secondary`）—— 那会推翻 §四 里「只写 `:root` 一份」那条立场，为这点差别不值得。

**留痕**：§一 初稿写的是「颜色不传字面值，取 `ToggleGroup` 那一对」；现在三处仍然同色，只是那一对从 `--accent` 换成了 `--secondary`。

## 它推翻了什么

- **「设置页左列是 `Tabs` 的纵向模式」**（本清单 §4／§5.5、`开发指南.md` 按钮样式一节的末句）—— 侧栏现在是 shadcn 的 `Sidebar`。`Tabs` 原语只剩页头那条横向导航在用，**纵向那档已无生产调用点**（只有 `tabs.test.tsx` 还在测它）。
- **「主题三态是 `RadioGroup` 的三张卡片」**（本清单 §5.5）—— 换成 `RubberSegment`；`radio-group.tsx` 与 `radio-group.test.tsx` 已删。
- **上一轮那个 vendored 的两级菜单不在这里记。** 它从未提交，也从未成文（工作区里有五个文件引用 `docs/adr/0023`，但这一篇此前不存在）。一条没成文的决定被反悔，不需要在「被推翻的成文决定」里留一行 —— 它在本文 §二 里作为「这条路走过、被看过否决」交代了。

## 实施状态

**已实施。**

- `frontend/src/shared/ui/sidebar.tsx` —— 新建，207 行，按需移植的 shadcn Sidebar。
- `frontend/src/shared/ui/branched-menu.tsx` —— 删除（连带它的测试）。
- `frontend/src/shared/ui/rubber-segment.tsx` —— vendored，499 行；文件头四条偏离。
- `frontend/src/shared/ui/radio-group.tsx`、`radio-group.test.tsx` —— 删除。
- `frontend/src/features/settings/SettingsSidebar.tsx` 与 `.test.tsx` —— 重写：条目类型改成本文件导出（父项带 `children`、叶子带 `icon`／`badge`），装配 `shared/ui/sidebar`；键盘那条测试从「方向键 + 单一 Tab 停靠点」换成「每一项都能 Tab 到」。
- `frontend/src/pages/SettingsPage.tsx` —— 条目类型、角标改数字（上游形态不把它算进名字里）、去掉 `size={16}`（`[&>svg]:size-4` 会盖掉它）、文件头注释。
- `frontend/src/theme/ThemeSetting.tsx` —— `RadioGroup` → `RubberSegment`；手柄与选中的字传 `--secondary` / `--secondary-foreground`，调用点补上 `outline-solid` 与 `--ring`（§五 与 §一）。
- `frontend/src/app/routes.test.tsx` —— `openSettingsSection` 改点普通按钮。
- `frontend/src/style.css` —— `:root` 与 `@theme inline` 各加六个 `--sidebar*`（**暗色块零改动**）；其中 `--sidebar-accent` 指向 `--secondary`（§五）。
- `frontend/src/shared/ui/toggle-group.tsx` —— 注释改掉（它举的例已经不是设置页的侧栏，也不是主题控件）；选中段从 `bg-accent` 换成 `bg-secondary`（§五）。
- `NOTICE` —— 「One file」→「Two files」，react-bits 块下加 `rubber-segment.tsx`。**Sidebar 不进 `NOTICE`**（见 §二 末）。

门禁：`npm run check` 通过（含 500 行上限：`sidebar.tsx` 207 行、`rubber-segment.tsx` 499 行），`npm test` 81 文件 457 用例全绿，`npm run build` 通过。

真实浏览器（无头 Chrome 开远程调试、用 CDP 驱动真实页面，同一做法记在 `docs/开发验收进度.md`；本次给页面注入的是一层假 IPC，页面本身在 dev server 上跑真实代码）里量过：上表的面板与页面底色、面板宽 224px、圆角 11px、内衬 7px、行高 28px、子行 25px、角标 18px、竖线取 `--border`、`list` 的可访问名、四个可见项的 `tabIndex`、展开与收起的面板高，以及两套主题各一张设置页截图。另外：**真键盘**从空焦点按 Tab 走一圈，顺序是空间切换器 → 页头「设置」→ 通用 → 常规与外观 → 空间 → 更新 → 视频目录 → 语言 → 主题分段条（回绕），**主题那条只占一个停靠点**；**焦点环真的画出来了** —— 2px、亮 `rgb(225,29,72)` / 暗 `rgb(255,51,75)`，且 `outline-style: none` 说明那是 `--ring` 的 `box-shadow` 而不是原生 outline（程序化 `.focus()` 不触发 `:focus-visible`，只有真按键才量得到，这一点差点被读数骗过去）；四个面板各点一遍，`data-active` 与右列的 `h2` 同步；系统「减少动态效果」打开后重载再走一遍，控制台零报错。产物 CSS 里核对过每一个用到的类都生成了（`hover:`／`active:`／`data-[active=true]:`／`peer-data-[…]/menu-button:` 全在）。

**§五 之后重跑的门禁与实测。** `npm run check` 通过（500 行上限：`sidebar.tsx` 208 行、`rubber-segment.tsx` 499 行），`npm test` 81 文件 457 用例全绿，`npm run build` 通过。真实浏览器里重新量了三处选中面与聚焦环：主题条暗色 `rgb(17,19,23)` → `rgb(42,45,51)`、亮色 `rgb(250,248,255)` → `rgb(254,205,211)`；侧栏当前行与面板 `rgb(20,23,29)` → `rgb(42,45,51)`；工具栏视图模式的选中段同值。真键盘 Tab 走到主题条（第 9 个停靠点）读到 `2px solid`、亮 `rgb(225,29,72)` / 暗 `rgb(255,51,75)`、`outline-offset: 3px`、`box-shadow: none` —— 而改前同一处读到的是 `2px none`，即那个环根本不存在。两套主题各出截图，含一张「改前 / `--secondary` / `--accent` + 红边」三条叠在一起的对比图。

**已知的不一致**：设置页的主题是 `RubberSegment`（会滑的手柄），工具栏的视图模式是 `ToggleGroup`（静态选中底色）。两个分段控件外观不同，本轮**有意不统一** —— 一个选「这一页怎么显示」，一个选「整个应用什么颜色」，后者值一个会动的手柄。**注意区别在形态，不在颜色**：§五 之后，两处选中的那一块填的是同一款 `--secondary`，左列的当前行也是。记在这里，免得后来者当成漏改。

**尚缺**：视频卡片 BorderGlow 那一篇（`0021`）仍未撰写；`border-glow.tsx` 的文件头已经引用了它。
