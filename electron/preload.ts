import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("session2skills", {
  version: "0.1.0",
});
