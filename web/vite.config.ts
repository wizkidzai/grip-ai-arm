import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Node's `process` (no @types/node in this project, so declare just what we use).
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  plugins: [react()],
  // Hosted under a sub-path (e.g. https://<user>.github.io/grip-ai-arm/): set GRIP_BASE=/grip-ai-arm/.
  base: process.env.GRIP_BASE ?? '/',
  // Pre-bundle lazily loaded deps. Otherwise the dev server reloads the page the
  // first time the Code tab opens, which would drop the USB connection to the arm.
  optimizeDeps: {
    include: ['blockly/core', 'blockly/msg/en', 'three/examples/jsm/controls/OrbitControls.js'],
  },
  // The AI teacher runs as a small local server (server/teacher.mjs) that holds the API key.
  // ...and her voice (server/voice, natural local text-to-speech) on 8788.
  server: { proxy: { '/api/voice': 'http://127.0.0.1:8788', '/api': 'http://127.0.0.1:8787' } },
  test: { environment: 'node' },
} as never);
