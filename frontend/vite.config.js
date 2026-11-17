import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
  ],
  // Tambahkan konfigurasi di bawah ini untuk memastikan path produksi aman
  base: './',
  server: {
    port: 80,
    host: true,
  },
})
