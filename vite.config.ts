import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  css: {
    postcss: "./postcss.config.cjs",
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "DialogueStory",
      formats: ["es", "cjs", "umd"],
      fileName: (format) => `dialogue-story.${format}.js`,
    },
    rollupOptions: {
      external: [/^react($|\/)/, /^react-dom($|\/)/],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith(".css")) {
            return "dialogue-story.css";
          }
          return "assets/[name]-[hash][extname]";
        },
      },
    },
    sourcemap: true,
    minify: true,
  },
});
