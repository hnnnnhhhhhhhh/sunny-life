import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5186,
    strictPort: true,
    watch: { ignored: ['**/.runtime/**', '**/art/**', '**/test-results/**'] },
  },
});
