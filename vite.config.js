import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Serves the Vercel function in api/alerts.js during `npm run dev` and `npm run preview`,
// so the Alerts panel works locally without the Vercel CLI.
const serveAlerts = (loadHandler) => async (req, res) => {
  const { default: handler } = await loadHandler();
  const response = await handler.fetch(new Request('http://localhost/api/alerts', { method: req.method }));
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(await response.text());
};

const localAlertsApi = () => ({
  name: 'local-alerts-api',
  configureServer(server) {
    server.middlewares.use(
      '/api/alerts',
      serveAlerts(() => server.ssrLoadModule('/api/alerts.js')),
    );
  },
  configurePreviewServer(server) {
    const file = new URL('./api/alerts.js', `file://${process.cwd()}/`).href;
    server.middlewares.use(
      '/api/alerts',
      serveAlerts(() => import(file)),
    );
  },
});

export default defineConfig({ plugins: [react(), localAlertsApi()], test: { environment: 'node' } });
