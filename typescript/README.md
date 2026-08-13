# CircuitJS1 原生 TypeScript 版

本目录可以脱离 Java/GWT 工程独立安装、编译和运行。页面、Canvas 绘制、
仿真循环、求解器、元件模型、示波器以及文件读写均由 TypeScript 实现。
Vite 和 Tauri 构建不会加载 `war/`、GWT 编译产物、兼容 iframe 或远程
CircuitJS1 页面。

## 运行

需要 Node.js 21 或更高版本（Node.js 24 已验证）。

```powershell
cd typescript
npm install
npm run dev
```

开发页面默认地址为 `http://127.0.0.1:5173`。

常用命令：

```powershell
npm test
npm run build
npm run check
npm run compatibility:report
npm run migration:report
```

- `npm test`：运行原生求解器、元件、格式兼容回归测试。
- `npm run build`：执行 TypeScript 类型检查并生成独立网页到 `dist/`。
- `npm run check`：依次运行全部测试和正式构建。
- `npm run compatibility:report`：逐个加载并求解 366 个内置电路。
- `npm run migration:report`：对比 Java 与 TypeScript 文件迁移情况。

视觉对比工具的源码也包含在 `visual-regression/` 中，但它必须在迁移工作区
配合外部原版 GWT 基线运行；独立 TypeScript 发布包不会携带旧版编译产物。

## 当前实现

- 原生 Canvas 电路绘制、选择、移动、缩放和平移。
- 运行、暂停、重置、撤销、重做、属性编辑及参数滑块。
- 文本/XML 电路导入导出、文件打开保存和快捷键。
- 稠密/稀疏 MNA 求解、瞬态步进和非线性迭代。
- 140 个绘制菜单入口（包含源、极性和 XML 专用变体）；原项目所有具体
  `*Elm.java` 电气元件类型均有 TypeScript 实现或对应的原生组合元件实现。
- 顶栏按原版划分为文件、编辑、绘制、示波器、选项、工具和电路；支持
  剪切/复制/粘贴、全选、翻转、五种拖动模式、分级元件菜单、右键菜单、
  显示选项、自动恢复以及文本/链接/PNG/SVG/CSV 导出。
- 电阻、电容、电感、开关、电源、半导体、变压器、继电器、电机、
  模拟/数字芯片、存储器、自定义逻辑、测量、音频和数据元件。
- 366 个原版示例内置在 TypeScript 包中；兼容报告达到
  366/366 可解析、可分析并至少完成一个求解步。
- 文本和 XML 只是兼容的数据格式，解析过程中不会执行旧版程序。

这并不表示旧 GWT 界面逐像素、逐类照搬。当前仍有少量高级差异：

- 非理想运放和光耦采用保持外部引脚及主要参数的原生行为模型，没有逐只
  复刻 Java 版内部晶体管网络。
- 示波器已经支持电压、电流、功率曲线；FFT、XY、触发和全部晶体管内部量
  还未达到原版完整程度。
- 部分高级编辑项、Adjustable 控件、所有绘图细节和快捷键尚未 1:1 对齐。
- 自定义组合元件的 XML 模型会保留；其每个内部子元件的瞬时仿真状态目前
  不保证完整序列化。

完整的渐进迁移步骤、验收门槛和 GitHub 提交方法见
[MIGRATION_PROCESS.md](./MIGRATION_PROCESS.md)，具体类映射和当前边界见
[MIGRATION.md](./MIGRATION.md)。

## Windows 桌面版

独立的 Tauri 2 包装位于 `desktop/`，它打包的就是同一份 `dist/`，
不会另外引用旧网页。

```powershell
npm run desktop:install
npm run desktop:dev
npm run desktop:build
```

桌面构建还需要 Rust、Visual Studio C++ Build Tools 和 Microsoft Edge
WebView2 Runtime。

构建输出：

```text
desktop\src-tauri\target\release\circuitjs1-desktop.exe
desktop\src-tauri\target\release\bundle\nsis\CircuitJS1_0.1.0_x64-setup.exe
```

## 拷贝到另一台电脑

只需拷贝 `typescript` 目录；`node_modules`、`dist` 和
`desktop/src-tauri/target` 都可以不拷贝。运行和编译均不需要父级 Java
仓库。

```powershell
cd D:\work\typescript
npm install
npm run dev
```

## 迁移原则

1. TypeScript 允许时保留 Java 类名、核心方法名和核心结构。
2. 保持文本/XML 电路数据兼容。
3. 对迁移后的电气行为增加回归测试。
4. Java 实现只作为源码参考，不修改它。
5. 不使用已编译 GWT 产物冒充未迁移功能。
