import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const pages = ['index', 'signup', 'dashboard', 'journals', 'diary', 'gratitude', 'goals', 'analysis']
const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  build: {
    rollupOptions: {
      input: Object.fromEntries(pages.map((page) => [page, resolve(projectRoot, `templates/${page}.html`)])),
    },
  },
})
