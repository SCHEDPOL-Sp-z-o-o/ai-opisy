import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base = nazwa repozytorium – strona działa pod https://schedpol-sp-z-o-o.github.io/ai-opisy/
export default defineConfig({
  plugins: [react()],
  base: '/ai-opisy/',
})
