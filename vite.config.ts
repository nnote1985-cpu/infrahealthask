import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      // อนุญาตให้ popup window (Google OAuth) ส่งผลกลับมาได้
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
})
