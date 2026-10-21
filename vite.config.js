import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import alias from '@rollup/plugin-alias'
import VueDevTools from 'vite-plugin-vue-devtools'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VueDevTools({
      launchEditor: 'cursor'
    }),
    alias({
      entries: [
        { find: '@', replacement: path.resolve(__dirname, 'src') }
      ]
    })
  ],
  base: './',
  build: {
    // 发布目录不能叫 dist（ztools publish 会忽略 dist 目录），故输出到 web/
    outDir: path.resolve(__dirname, 'web'),
    emptyOutDir: true
  }
})