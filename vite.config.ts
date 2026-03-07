import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const resolveProxyTarget = (env: Record<string, string>) => {
  const explicitTarget = trimTrailingSlash(
    String(env.VITE_DEV_PROXY_TARGET || env.VITE_API_URL || '').trim()
  );

  if (!explicitTarget || explicitTarget.startsWith('/')) {
    return `http://localhost:${String(env.VITE_API_PORT || '5000').trim() || '5000'}`;
  }

  try {
    const parsed = new URL(explicitTarget);
    return `${parsed.protocol}//${parsed.host}`;
  } catch (_) {
    return explicitTarget.endsWith('/api')
      ? explicitTarget.slice(0, -4)
      : explicitTarget;
  }
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const proxyTarget = resolveProxyTarget(env);

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            charts: ['recharts'],
            ui: ['lucide-react'],
            http: ['axios'],
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
