import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // tailwindcss() enables the Tailwind v4 Vite plugin (used via `@import
  // "tailwindcss"` in app/app.css). reactRouter() wires up route discovery,
  // SSR bundling, and the typegen that produces the `./+types/*` modules
  // each route file imports.
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    // Lets TypeScript path aliases from tsconfig.json (e.g. "~/*") resolve
    // correctly in Vite, not just in the editor/type-checker.
    tsconfigPaths: true,
  },
});
