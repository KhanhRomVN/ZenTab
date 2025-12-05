// File: vite.config.ts
import path from "path";
import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { Plugin } from "vite";

function removeExportsPlugin(): Plugin {
  return {
    name: "remove-exports",
    generateBundle(_options, bundle) {
      const serviceWorkerFile = bundle["serviceWorker.js"];
      if (serviceWorkerFile && serviceWorkerFile.type === "chunk") {
        // Remove export statements from service worker
        serviceWorkerFile.code = serviceWorkerFile.code.replace(
          /export\s*\{[^}]*\}\s*;?\s*$/gm,
          ""
        );
      }
    },
  };
}

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        sidebarApp: resolve(__dirname, "sidebar.html"),
        serviceWorker: resolve(__dirname, "src/background/service-worker.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "serviceWorker") {
            return "serviceWorker.js";
          }
          if (chunkInfo.name === "sidebarApp") {
            return "sidebar.js";
          }
          return "[name].js";
        },
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
        format: "es",
        preserveModules: false,
      },
    },
    minify: "esbuild",
    target: "es2020",
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [{ src: "manifest.json", dest: "." }],
    }),
    removeExportsPlugin(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV || "production"
    ),
    global: "globalThis",
  },
});
