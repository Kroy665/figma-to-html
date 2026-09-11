import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { viteSingleFile } from 'vite-plugin-singlefile'

const isUI = process.env.BUILD_TARGET === 'ui'

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ['@babel/plugin-transform-spread']
      }
    }),
    isUI && viteSingleFile()
  ].filter(Boolean),
  base: isUI ? './' : undefined,
  build: {
    target: 'es2015',
    rollupOptions: {
      input: isUI
        ? resolve(__dirname, 'src/ui.html')
        : resolve(__dirname, 'src/main.ts'),
      output: {
        entryFileNames: isUI ? 'ui.js' : 'main.js',
        format: isUI ? 'iife' : 'cjs',
        inlineDynamicImports: isUI,
      },
    },
    outDir: 'dist',
    emptyOutDir: false,
    minify: 'esbuild',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  esbuild: {
    target: 'es2015',
  },
})
