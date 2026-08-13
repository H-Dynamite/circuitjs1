# CircuitJS1 原生 TypeScript 渐进迁移过程

本文记录从 Java/GWT 版本迁移到原生 TypeScript 版本的实施顺序、阶段验收
条件和 GitHub 提交方式。它描述的是可复现的工程迁移过程；具体类映射和
当前差异见 [MIGRATION.md](./MIGRATION.md)。

## 迁移目标和边界

迁移遵循以下约束：

1. 原 `src/`、`war/` 和 Gradle/GWT 工程保持不变，作为行为和格式基线。
2. 新实现全部放在 `typescript/`，可以单独复制、安装、运行和构建。
3. 保留核心类、核心方法和数据结构的名称；UI 适配层允许改用现代 DOM、
   Canvas 和事件模型。
4. 保持原版文本电路和 XML 电路格式兼容。
5. 不加载 `war/`、GWT 编译产物、旧页面 iframe 或远程 CircuitJS1 页面。
6. 每迁移一层，先通过该层测试，再迁移依赖它的上一层。

运行时依赖关系如下：

```text
NativeCircuitApp / Canvas / Scope
                │
       CircuitLoader / XML
                │
          ElementFactory
                │
     CircuitElm 与各类元件模型
                │
 CircuitRunner / SimulationManager
                │
   节点、矩阵、几何和数值工具
```

## 阶段记录

| 阶段 | 迁移内容 | 验收条件 | 当前状态 |
| --- | --- | --- | --- |
| 0. 基线与清点 | 统计 Java 文件、元件类、原版示例和数据格式 | 可生成文件映射报告 | 已完成 |
| 1. 独立工程壳 | TypeScript、Vite、Vitest、入口和独立资源目录 | 不依赖父目录即可启动 | 已完成 |
| 2. 数值与仿真核心 | 节点、矩阵、MNA、非线性迭代、瞬态步进 | 核心求解器测试通过 | 已完成 |
| 3. 元件模型 | 无源器件、电源、半导体、模拟/数字芯片等 | 原版具体电气元件均有原生对应实现 | 已完成 |
| 4. 格式与示例 | 文本/XML 解析、序列化、内置示例 | 366/366 示例可加载、分析并求解一步 | 已完成 |
| 5. Web 界面 | Canvas、七个菜单、原版风格工具栏、编辑和示波器 | 可完成绘制、编辑、运行和导入导出 | 已完成主要流程 |
| 6. 桌面包装 | Tauri 2 引用同一份 Vite 构建 | 开发模式和 Windows 构建可执行 | 已接入，需发布机最终验收 |
| 7. 完整对齐 | 高级示波器、全部属性控件、细节和快捷键 | 与原版逐项验收 | 持续进行 |

### 阶段 0：建立可量化基线

- `scripts/migration-report.mjs` 对比 Java 与 TypeScript 文件名。
- `scripts/compatibility-report.mjs` 遍历全部内置电路并统计元件类型。
- 保留原版示例作为兼容性测试输入，不把截图相似当作迁移完成标准。

验收命令：

```powershell
npm run migration:report
npm run compatibility:report
```

### 阶段 1：建立完全独立的 TypeScript 工程

- 使用原生 ES Module、TypeScript 5、Vite 和 Vitest。
- 删除早期的 `sync:legacy` 构建路径。
- `npm run dev` 和 `npm run build` 不访问 `../war`。
- 资源、示例和程序入口都位于 `typescript/` 内。

这一阶段解决了“复制到另一台电脑后找不到 `war/`”的问题。

### 阶段 2：自底向上迁移仿真核心

按以下顺序迁移，避免 UI 和数值逻辑耦合：

1. `Point`、`Rectangle`、节点和基础数据结构。
2. 稠密/稀疏矩阵与 LU 求解。
3. `CircuitElm` 基类和盖章接口。
4. `SimulationManager` 与 `CircuitRunner`。
5. 非线性迭代、时间步进和错误状态。

核心方法尽量保持原命名，例如 `stampResistor`、`stampVoltageSource`、
`startIteration`、`doStep` 和 `calculateCurrent`。

### 阶段 3：按依赖顺序迁移元件

元件迁移顺序为：

1. 导线、电阻、电容、电感、开关和独立源。
2. 二极管、BJT、JFET、MOSFET 和受控源。
3. 运放、变压器、传输线、继电器和电机。
4. 逻辑门、触发器、计数器、存储器和转换器。
5. 自定义逻辑、组合元件、音频、数据和测量元件。

每个元件至少检查以下内容：

- 端子数、内部节点和电压源数量。
- 原版文本类型编号或 XML 标签。
- `stamp`、迭代、步进和电流计算。
- 默认参数、编辑参数和序列化字段。
- Canvas 符号和选中范围。

### 阶段 4：恢复数据格式和示例兼容

- `CircuitLoader` 负责文本格式。
- `XMLSerializer` 和 `XMLDeserializer` 负责 XML 往返。
- `ElementFactory` 集中注册类型编号、XML 标签和 UI 别名。
- 366 个示例随 TypeScript 包发布，不执行旧版 JavaScript。

截至 2026-07-26 的报告：

```text
Circuit example files:       366
Element records:             10196
Element types used:          135
Structurally loadable files: 366/366
Unsupported element types:   0
```

### 阶段 5：迁移原版交互，而不是包装旧页面

界面由 `NativeCircuitApp.ts` 和 `CircuitCanvasRenderer.ts` 原生实现，包括：

- 文件、编辑、绘制、示波器、选项、工具和电路七个菜单。
- 按原版顺序排列的 SVG 工具栏和元件变体面板。
- 选择、拖动、缩放、撤销/重做、剪切/复制/粘贴和右键菜单。
- 属性编辑、参数滑块、运行/暂停、示波器和显示选项。
- 文本、XML、链接、PNG、SVG 和 CSV 导入导出。

这里以功能行为为第一验收条件，再逐步对齐像素和高级功能。

### 阶段 6：复用 Web 构建生成桌面程序

`desktop/` 使用 Tauri 2。桌面程序只加载 `typescript/dist/`，Web 与桌面
共用同一套 TypeScript 逻辑，不再维护第二份仿真代码。

```powershell
npm run desktop:install
npm run desktop:dev
npm run desktop:build
```

## 当前验证门槛

每次合并涉及 TypeScript 的修改前，至少运行：

```powershell
cd typescript
npm ci
npm run check
npm run compatibility:report
npm run migration:report
```

当前基线：

- TypeScript 源文件：183。
- Java 同名直接移植文件：172。
- 自动化测试：64 项。
- 原版示例结构兼容：366/366。
- 未注册的示例元件类型：0。

`migration:report` 中剩余的 71 个“未同名移植”主要是 GWT 窗口、菜单、
控件和适配类，以及由新架构合并承接的基础类。这个数字是文件名映射结果，
不能直接理解为还有 71 个电气功能未实现。

## 后续迁移规则

新增或补齐功能时采用一个功能一个闭环：

1. 从 Java 源码和原版示例确认行为。
2. 在现有 TypeScript 对应类中实现，保留核心方法名。
3. 为数值行为或格式兼容增加测试。
4. 运行 `npm run check` 和兼容报告。
5. 在 `MIGRATION.md` 更新已知差异。
6. 一个提交只处理一个可描述的兼容功能。

建议提交信息：

```text
feat(sim): port <element or solver behavior>
feat(ui): align <menu or interaction> with legacy UI
fix(io): preserve <field> during circuit round-trip
test(compat): cover <original example or element>
docs(migration): update TypeScript parity status
```

## GitHub 提交方式

### 提交到现有 Git 仓库

不要提交 `node_modules/`、`dist/`、Tauri `target/` 或 `typescript.zip`。

```powershell
git add .gitignore README.md .github/workflows/typescript.yml typescript
git status --short
git commit -m "feat: add native TypeScript CircuitJS1 migration"
git push
```

### 当前目录是下载的 ZIP、尚无 `.git`

本工作目录当前没有 Git 元数据。如需新建仓库：

```powershell
git init
git add .
git status --short
git commit -m "feat: add native TypeScript CircuitJS1 migration"
git branch -M main
git remote add origin https://github.com/<你的账号>/<仓库名>.git
git push -u origin main
```

执行 `git add` 后务必先检查 `git status --short`，确认忽略项没有进入提交。

## Pull Request 检查清单

- [ ] `npm run check` 通过。
- [ ] `npm run compatibility:report` 仍为 366/366。
- [ ] 没有新增不支持的元件类型。
- [ ] `npm run dev` 不访问 `war/` 或 GWT 产物。
- [ ] 新增/修改功能有测试或明确的手工验收记录。
- [ ] `MIGRATION.md` 中的完成度和已知差异已同步。
- [ ] 未提交依赖目录、构建产物、安装包或本机缓存。
