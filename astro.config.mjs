import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

const base = process.env.SITE_BASE || '/';

export default defineConfig({
  base,
  integrations: [
    react()
  ],
  output: 'static',
  build: {
    assets: '_assets'
  },
  vite: {
    css: {
      postcss: './postcss.config.cjs'
    }
  }
});
