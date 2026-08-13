import "./styles.css";
import {
  NativeCircuitApp,
  type NativeCircuitApi
} from "./app/NativeCircuitApp";

const root = document.querySelector<HTMLElement>("#app");
if (root === null) {
  throw new Error("Application mount point #app was not found");
}

const application = new NativeCircuitApp(root);
window.CircuitJS1TS = application.api;

declare global {
  interface Window {
    CircuitJS1TS: NativeCircuitApi;
  }
}
