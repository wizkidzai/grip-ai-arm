import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Pre-bundle lazily loaded deps. Otherwise the dev server reloads the page the
  // first time the Code tab opens, which would drop the USB connection to the arm.
  optimizeDeps: {
    include: ['blockly/core', 'blockly/msg/en', 'three/examples/jsm/controls/OrbitControls.js'],
  },
  test: { environment: 'node' },
} as never);
