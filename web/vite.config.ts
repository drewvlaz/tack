import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {return;}
          if (id.includes('framer-motion')) {return 'motion';}
          if (id.includes('@tanstack') || id.includes('@trpc')) {return 'query';}
          if (id.includes('/react-dom/') || id.includes('/react/')) {return 'react';}
        },
      },
    },
  },
});
