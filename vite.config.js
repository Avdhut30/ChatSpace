import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.RUN_ENV': JSON.stringify('browser'),
  },
  optimizeDeps: {
    rolldownOptions: {
      transform: {
        define: {
          'process.env.RUN_ENV': JSON.stringify('browser'),
        },
      },
    },
  },
  build: {
    outDir: 'build',
  },
});
