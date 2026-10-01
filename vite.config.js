import { defineConfig } from 'vite';

import { prepareBundle } from './tools/vite-plugin-offline.js';

// GitHub Pages serves a project site from /<repository>/, so the base path has to
// match whatever the repository is called. Taking it from the Actions environment
// means a fork or a rename needs no edit here.
const repository = process.env.GITHUB_REPOSITORY?.split('/')[1];
const base = process.env.GITHUB_PAGES === 'true' ? `/${repository ?? 'cell-atelier'}/` : '/';

export default defineConfig({
  base,
  plugins: [prepareBundle()],
  server: {
    watch: {
      // Editors and tools that write through a temporary sibling file would
      // otherwise make the watcher trip over a locked path on Windows.
      ignored: ['**/.*.tmpdir/**', '**/*.tmp'],
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/build/three.core')) return 'three-core';
          if (id.includes('node_modules/three/build/three.module')) return 'three-renderer';
          if (id.includes('node_modules/three/')) return 'three-addons';
        },
      },
    },
  },
});
