import { defineConfig } from 'vite';
import path from 'node:path';

// الجذر = client/. المجلد shared/ خارج الجذر ويُستورد بمسار نسبي، لذا نسمح لـ Vite بالقراءة من جذر المشروع.
export default defineConfig({
  base: './', // مسارات نسبية: ضرورية لـ Capacitor (ملفات محلية داخل التطبيق)
  server: { host: true, port: 5173, fs: { allow: [path.resolve(import.meta.dirname, '..')] } },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 1600 },
});
