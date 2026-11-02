import { defineConfig } from 'vite';

// 相對路徑：GitHub Pages 子路徑（/tile-world/）與本機都能用
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 800 },
});
