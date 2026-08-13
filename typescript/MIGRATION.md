# 原生 TypeScript 迁移状态

本文记录当前实现状态；可复现的阶段划分、验收规则和 GitHub 提交方式见
[MIGRATION_PROCESS.md](./MIGRATION_PROCESS.md)。

Java 源码共有 243 个文件。`typescript` 目录的运行时已经完全独立：
没有 `sync:legacy`，不读取父目录的 `war/`，也不会用 GWT 编译结果替代
未迁移功能。

截至当前版本：

- 183 个 TypeScript 源文件。
- 172 个与 Java 同名的直接移植文件。
- Java 中 150 个 `*Elm.java` 类仅剩 4 个基础/抽象层名称没有同名文件：
  `CircuitElm` 已位于 `core/CircuitElm.ts`；`CompositeElm` 和
  `CustomCompositeChipElm` 由原生组合元件体系承接；`GraphicElm` 是旧
  GWT 绘图基类。不存在尚未注册的具体电气元件类。
- 135 种示例中实际使用的文本/XML 元件类型全部已注册。
- 366/366 个内置示例均可原生解析、分析并完成求解步。

## 原生运行路径

| 区域 | TypeScript 实现 | 状态 |
| --- | --- | --- |
| 应用入口 | `src/main.ts`, `app/NativeCircuitApp.ts` | 原生 |
| Canvas 与元件符号 | `ui/CircuitCanvasRenderer.ts` | 原生；电源与 MOSFET 使用原版几何 |
| 仿真循环 | `core/CircuitRunner.ts` | 原生 |
| 菜单与交互 | `app/NativeCircuitApp.ts` | 原生七菜单、140 个绘制入口及右键菜单 |
| 示波器 | `app/NativeCircuitApp.ts` | 原生基础与 V/I/P |
| 导入导出 | `core/CircuitLoader.ts`, `XML*` | 原生文本/XML |
| 示例资源 | `src/examples/circuits` | 366 个内置 |
| 桌面打包 | `desktop/src-tauri` | 原生 Tauri 包装 |

## 仿真基础

| Java 源 | TypeScript 目标 | 状态 |
| --- | --- | --- |
| `Point.java`, `Rectangle.java` | `core/Point.ts`, `core/Rectangle.ts` | 已迁移 |
| `CircuitNode*`, `CircuitMatrix` | 对应 `core/*` 文件 | 已迁移 |
| `SimulationManager` | `SimulationManager.ts`, `CircuitRunner.ts` | 已迁移 |
| 稠密/稀疏 LU | `SimulationManager.ts`, `core/matrix/*` | 已迁移 |
| 文本/XML | `CircuitLoader.ts`, `XMLSerializer.ts`, `XMLDeserializer.ts` | 已迁移 |
| `CircuitElm.java` | `core/CircuitElm.ts` | 已迁移 |
| 无源器件、开关、电源 | 对应 `elements/*` | 已迁移 |
| 二极管/MOSFET/BJT/JFET | 对应模型与元件文件 | 已迁移 |
| 受控源、运放、OTA | 对应 `elements/*` | 已迁移 |
| 变压器、继电器、传输线、电机 | 对应 `elements/*` | 已迁移 |
| 逻辑门、触发器、转换器、存储器 | 对应 `elements/*` | 已迁移 |
| 自定义逻辑和自定义组合元件 | `CustomLogic*`, `CustomCompositeElm` | 已迁移 |
| 数据/音频/测量元件 | 对应 `elements/*` | 已迁移基础功能 |

## 尚未做到 1:1 的部分

1. `OpAmpRealElm` 和 `OptocouplerElm` 是原生行为模型，保留公共引脚、
   核心参数、限幅/转换行为，但没有照抄 Java 版内部晶体管级组合网络。
2. 原 GWT 的窗口、菜单、对话框等 71 个 UI/适配文件由现代 DOM/Canvas
   架构替代，不以“每个 Java 文件对应一个 TS 文件”为目标。
3. 示波器 FFT、XY、触发、全部器件内部量，以及部分高级属性编辑控件仍需
   继续增强。
4. Adjustable 控件、全部原版快捷键、全部绘制细节和像素级布局还未完整
   对齐。
5. 自定义组合模型定义可在 XML 中往返保存，但内部子元件的全部瞬时求解
   状态尚未保证完整序列化。

可运行 `npm run migration:report` 查看文件名映射，运行
`npm run compatibility:report` 查看全部内置示例兼容结果。
