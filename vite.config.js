import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    // Serve /api/validate as a dev endpoint so LLMs can test locally
    {
      name: 'api-validate',
      configureServer(server) {
        server.middlewares.use('/api/validate', async (req, res) => {
          // CORS preflight
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
          }

          if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
            return;
          }

          // Read body
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const body = Buffer.concat(chunks).toString();

          try {
            const mod = await server.ssrLoadModule('/api/validate.js');
            const data = mod.parseLenient(body);
            const result = await mod.validate(data);
            res.writeHead(result.valid ? 200 : 422, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              valid: false,
              summary: { errors: 1, warnings: 0, info: 0 },
              issues: [{
                level: 'error',
                category: 'parse-error',
                message: `Failed to parse: ${e.message}`,
                fix: 'Send a valid JSON object with an "events" array.',
              }],
            }));
          }
        });
      },
    },
  ],
  // Exclude heavy deps from pre-bundling so they are code-split as true
  // dynamic imports rather than inlined into the main chunk.
  optimizeDeps: {
    exclude: ['@strudel/web'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep @strudel/web in its own chunk — only loaded when audio is initialised
          if (id.includes('@strudel')) return 'strudel';
        },
      },
    },
  },
  // SPA history fallback — Vite dev server serves index.html for all routes by default
  // (appType: 'spa' is the default). For production, configure your hosting to do the same.
});
