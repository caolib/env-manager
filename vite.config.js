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
    // 构建产物直接输出到 ZTools 插件目录下
    outDir: path.resolve(__dirname, 'src-ztools/dist'),
    emptyOutDir: true
  }
})