// vite.config.ts
import path from "path";
import { resolve } from "path";
import { defineConfig } from "file:///home/khanhromvn/Documents/Coding/ZenTab/node_modules/vite/dist/node/index.js";
import react from "file:///home/khanhromvn/Documents/Coding/ZenTab/node_modules/@vitejs/plugin-react-swc/index.mjs";
import { viteStaticCopy } from "file:///home/khanhromvn/Documents/Coding/ZenTab/node_modules/vite-plugin-static-copy/dist/index.js";
var __vite_injected_original_dirname = "/home/khanhromvn/Documents/Coding/ZenTab";
var vite_config_default = defineConfig({
  build: {
    rollupOptions: {
      input: {
        sidebarApp: resolve(__vite_injected_original_dirname, "sidebar.html"),
        serviceWorker: resolve(__vite_injected_original_dirname, "src/background/service-worker.ts")
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
        assetFileNames: "[name].[ext]"
      }
    },
    minify: "esbuild",
    target: "es2020"
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [{ src: "manifest.json", dest: "." }]
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    }
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV || "production"
    ),
    global: "globalThis"
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9raGFuaHJvbXZuL0RvY3VtZW50cy9Db2RpbmcvWmVuVGFiXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9raGFuaHJvbXZuL0RvY3VtZW50cy9Db2RpbmcvWmVuVGFiL3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL2toYW5ocm9tdm4vRG9jdW1lbnRzL0NvZGluZy9aZW5UYWIvdml0ZS5jb25maWcudHNcIjsvLyBGaWxlOiB2aXRlLmNvbmZpZy50c1xuaW1wb3J0IHBhdGggZnJvbSBcInBhdGhcIjtcbmltcG9ydCB7IHJlc29sdmUgfSBmcm9tIFwicGF0aFwiO1xuaW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSBcInZpdGVcIjtcbmltcG9ydCByZWFjdCBmcm9tIFwiQHZpdGVqcy9wbHVnaW4tcmVhY3Qtc3djXCI7XG5pbXBvcnQgeyB2aXRlU3RhdGljQ29weSB9IGZyb20gXCJ2aXRlLXBsdWdpbi1zdGF0aWMtY29weVwiO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBidWlsZDoge1xuICAgIHJvbGx1cE9wdGlvbnM6IHtcbiAgICAgIGlucHV0OiB7XG4gICAgICAgIHNpZGViYXJBcHA6IHJlc29sdmUoX19kaXJuYW1lLCBcInNpZGViYXIuaHRtbFwiKSxcbiAgICAgICAgc2VydmljZVdvcmtlcjogcmVzb2x2ZShfX2Rpcm5hbWUsIFwic3JjL2JhY2tncm91bmQvc2VydmljZS13b3JrZXIudHNcIiksXG4gICAgICB9LFxuICAgICAgb3V0cHV0OiB7XG4gICAgICAgIGVudHJ5RmlsZU5hbWVzOiAoY2h1bmtJbmZvKSA9PiB7XG4gICAgICAgICAgaWYgKGNodW5rSW5mby5uYW1lID09PSBcInNlcnZpY2VXb3JrZXJcIikge1xuICAgICAgICAgICAgcmV0dXJuIFwic2VydmljZVdvcmtlci5qc1wiO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoY2h1bmtJbmZvLm5hbWUgPT09IFwic2lkZWJhckFwcFwiKSB7XG4gICAgICAgICAgICByZXR1cm4gXCJzaWRlYmFyLmpzXCI7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBcIltuYW1lXS5qc1wiO1xuICAgICAgICB9LFxuICAgICAgICBjaHVua0ZpbGVOYW1lczogXCJbbmFtZV0uanNcIixcbiAgICAgICAgYXNzZXRGaWxlTmFtZXM6IFwiW25hbWVdLltleHRdXCIsXG4gICAgICB9LFxuICAgIH0sXG4gICAgbWluaWZ5OiBcImVzYnVpbGRcIixcbiAgICB0YXJnZXQ6IFwiZXMyMDIwXCIsXG4gIH0sXG4gIHBsdWdpbnM6IFtcbiAgICByZWFjdCgpLFxuICAgIHZpdGVTdGF0aWNDb3B5KHtcbiAgICAgIHRhcmdldHM6IFt7IHNyYzogXCJtYW5pZmVzdC5qc29uXCIsIGRlc3Q6IFwiLlwiIH1dLFxuICAgIH0pLFxuICBdLFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgIFwiQFwiOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcIi4vc3JjXCIpLFxuICAgIH0sXG4gIH0sXG4gIGRlZmluZToge1xuICAgIFwicHJvY2Vzcy5lbnYuTk9ERV9FTlZcIjogSlNPTi5zdHJpbmdpZnkoXG4gICAgICBwcm9jZXNzLmVudi5OT0RFX0VOViB8fCBcInByb2R1Y3Rpb25cIlxuICAgICksXG4gICAgZ2xvYmFsOiBcImdsb2JhbFRoaXNcIixcbiAgfSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUNBLE9BQU8sVUFBVTtBQUNqQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxvQkFBb0I7QUFDN0IsT0FBTyxXQUFXO0FBQ2xCLFNBQVMsc0JBQXNCO0FBTC9CLElBQU0sbUNBQW1DO0FBT3pDLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLE9BQU87QUFBQSxJQUNMLGVBQWU7QUFBQSxNQUNiLE9BQU87QUFBQSxRQUNMLFlBQVksUUFBUSxrQ0FBVyxjQUFjO0FBQUEsUUFDN0MsZUFBZSxRQUFRLGtDQUFXLGtDQUFrQztBQUFBLE1BQ3RFO0FBQUEsTUFDQSxRQUFRO0FBQUEsUUFDTixnQkFBZ0IsQ0FBQyxjQUFjO0FBQzdCLGNBQUksVUFBVSxTQUFTLGlCQUFpQjtBQUN0QyxtQkFBTztBQUFBLFVBQ1Q7QUFDQSxjQUFJLFVBQVUsU0FBUyxjQUFjO0FBQ25DLG1CQUFPO0FBQUEsVUFDVDtBQUNBLGlCQUFPO0FBQUEsUUFDVDtBQUFBLFFBQ0EsZ0JBQWdCO0FBQUEsUUFDaEIsZ0JBQWdCO0FBQUEsTUFDbEI7QUFBQSxJQUNGO0FBQUEsSUFDQSxRQUFRO0FBQUEsSUFDUixRQUFRO0FBQUEsRUFDVjtBQUFBLEVBQ0EsU0FBUztBQUFBLElBQ1AsTUFBTTtBQUFBLElBQ04sZUFBZTtBQUFBLE1BQ2IsU0FBUyxDQUFDLEVBQUUsS0FBSyxpQkFBaUIsTUFBTSxJQUFJLENBQUM7QUFBQSxJQUMvQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBQ0EsU0FBUztBQUFBLElBQ1AsT0FBTztBQUFBLE1BQ0wsS0FBSyxLQUFLLFFBQVEsa0NBQVcsT0FBTztBQUFBLElBQ3RDO0FBQUEsRUFDRjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sd0JBQXdCLEtBQUs7QUFBQSxNQUMzQixRQUFRLElBQUksWUFBWTtBQUFBLElBQzFCO0FBQUEsSUFDQSxRQUFRO0FBQUEsRUFDVjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
