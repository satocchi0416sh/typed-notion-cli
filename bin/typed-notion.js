#!/usr/bin/env node
/* global console, process */

// ESM loader for the CLI
import('../dist/index.js').catch(err => {
  console.error('Failed to load typed-notion CLI:', err);
  process.exit(1);
});
