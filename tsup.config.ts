import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: 'node18',
  platform: 'node',

  // Bundle optimization
  minify: process.env.NODE_ENV === 'production',
  treeshake: true,

  // External dependencies to reduce bundle size
  external: [
    // Keep these as external to reduce bundle size
    'prettier', // Large formatting library - should be external
    'chalk', // Terminal colors - commonly available
    'prompts', // Interactive prompts - rarely used in CI
  ],

  // Environment specific optimizations
  define: {
    __DEV__: process.env.NODE_ENV === 'development' ? 'true' : 'false',
    __VERSION__: JSON.stringify(process.env.npm_package_version || '0.1.0'),
  },

  // Bundle analysis in development
  metafile: true,

  onSuccess: async () => {
    // Bundle size analysis
    if (process.env.NODE_ENV !== 'production') {
      const fs = await import('fs');
      const path = await import('path');

      try {
        const distPath = path.join(__dirname, 'dist');
        const files = await fs.promises.readdir(distPath);

        console.log('\n📦 Bundle Size Analysis:');

        for (const file of files) {
          if (file.endsWith('.js') || file.endsWith('.cjs')) {
            const filePath = path.join(distPath, file);
            const stats = await fs.promises.stat(filePath);
            const sizeKB = (stats.size / 1024).toFixed(2);
            console.log(`  ${file}: ${sizeKB} KB`);
          }
        }

        console.log('\n💡 Optimization tips:');
        console.log('  - External deps are not bundled to reduce size');
        console.log('  - Use NODE_ENV=production for minified builds');
        console.log('  - Tree shaking removes unused code automatically\n');
      } catch (error) {
        console.warn('Could not analyze bundle size:', error);
      }
    }
  },
});
