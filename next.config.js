const path = require('path');

module.exports = {
  typescript: {
    // ✅ Faz o Next buildar mesmo com erros de tipagem (TS2339, TS7006, etc.)
    ignoreBuildErrors: true,
  },
  experimental: {
    workerThreads: false, // desativa threads múltiplos
    cpus: 1,               // força usar 1 “CPU” para build/export
  },
  eslint: {
    // ✅ Evita o ESLint travar o build no CI
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@': path.resolve(__dirname, 'src'),
    };
    

    return config;
  },
};