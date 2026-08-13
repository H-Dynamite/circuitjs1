# CircuitJS1 Tauri desktop wrapper

This folder packages the parent native TypeScript/Vite application as a Tauri 2
Windows desktop application. No GWT or compatibility runtime is bundled.

From `typescript`:

```powershell
npm run desktop:install
npm run desktop:dev
npm run desktop:build
```

The wrapper runs the parent Vite build automatically and packages that exact
output. The unpackaged executable and NSIS installer are written to:

- `src-tauri/target/release/circuitjs1-desktop.exe`
- `src-tauri/target/release/bundle/nsis/`
