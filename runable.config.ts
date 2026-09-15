import { defineConfig } from "runable";

export default defineConfig({
  ssr: true,
  head: {
    title: "Keep — Notes",
    meta: [
      {
        name: "description",
        content: "Une application simple pour noter ce qui compte.",
      },
      { name: "theme-color", content: "#f8f7f4" },
    ],
  },

  css: ["./app/assets/css/main.css"],

  modules: ["@runablejs/pinia", "@runablejs/tailwindcss"],

  components: { dirs: "./app/components", prefix: "U" },

  tailwindcss: {
    injectCss: false,
  },

  pinia: {},

  vite: {
    resolve: {
      dedupe: ["vue", "@vue/runtime-core", "@vue/runtime-dom"],
    },
    optimizeDeps: {
      exclude: ["vue", "@vue/runtime-core", "@vue/runtime-dom"],
    },
  },
});
