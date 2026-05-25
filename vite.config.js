import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/taoluyen/', // BẮT BUỘC PHẢI CÓ DÒNG NÀY ĐỂ KHÔNG BỊ TRẮNG TRANG
})