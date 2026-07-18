#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEMPLATES = ['vanilla', 'react', 'svelte'];
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function color(text, colorName) {
  return `${COLORS[colorName]}${text}${COLORS.reset}`;
}

function log(message) {
  console.log(message);
}

function logSuccess(message) {
  console.log(color(`✓ ${message}`, 'green'));
}

function logError(message) {
  console.error(color(`✗ ${message}`, 'red'));
}

function logInfo(message) {
  console.log(color(`ℹ ${message}`, 'cyan'));
}

async function prompt(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function select(question, options) {
  log(color(question, 'bright'));
  options.forEach((opt, i) => {
    log(`  ${color(`${i + 1})`, 'cyan')} ${opt}`);
  });

  while (true) {
    const answer = await prompt(color('Enter number: ', 'dim'));
    const num = parseInt(answer, 10);
    if (num >= 1 && num <= options.length) {
      return options[num - 1];
    }
    logError(`Please enter a number between 1 and ${options.length}`);
  }
}

function copyDir(src, dest, projectName) {
  mkdirSync(dest, { recursive: true });

  const entries = readdirSync(src);

  for (const entry of entries) {
    const srcPath = join(src, entry);
    let destPath = join(dest, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      copyDir(srcPath, destPath, projectName);
    } else {
      let content = readFileSync(srcPath, 'utf-8');

      // Replace template variables
      content = content.replace(/\{\{PROJECT_NAME\}\}/g, projectName);

      // Handle .template extension
      if (entry.endsWith('.template')) {
        destPath = join(dest, entry.replace('.template', ''));
      }

      writeFileSync(destPath, content);
    }
  }
}

function printHelp() {
  log(`
${color('create-rovebeacon', 'bright')} - Create a new RoveBeacon project

${color('Usage:', 'yellow')}
  npx create-rovebeacon [project-name] [options]

${color('Options:', 'yellow')}
  --template, -t <template>  Template to use (vanilla, react, svelte)
  --help, -h                 Show this help message

${color('Examples:', 'yellow')}
  npx create-rovebeacon my-app
  npx create-rovebeacon my-app --template react
  npx create-rovebeacon my-app -t svelte

${color('Templates:', 'yellow')}
  ${color('vanilla', 'cyan')}  - Plain TypeScript + Three.js
  ${color('react', 'cyan')}    - React + React Three Fiber
  ${color('svelte', 'cyan')}   - Svelte 5 + Three.js
`);
}

async function main() {
  const args = process.argv.slice(2);

  // Handle help flag
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  log('');
  log(color('🛰️  Create RoveBeacon App', 'bright'));
  log(color('   GPS + Three.js location tracking', 'dim'));
  log('');

  // Parse arguments
  let projectName = null;
  let template = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--template' || arg === '-t') {
      template = args[++i];
    } else if (!arg.startsWith('-')) {
      projectName = arg;
    }
  }

  // Prompt for project name if not provided
  if (!projectName) {
    projectName = await prompt(color('Project name: ', 'bright'));
    if (!projectName) {
      logError('Project name is required');
      process.exit(1);
    }
  }

  // Validate project name
  if (!/^[a-z0-9-_]+$/i.test(projectName)) {
    logError('Project name can only contain letters, numbers, dashes, and underscores');
    process.exit(1);
  }

  // Check if directory exists
  const targetDir = join(process.cwd(), projectName);
  if (existsSync(targetDir)) {
    logError(`Directory "${projectName}" already exists`);
    process.exit(1);
  }

  // Prompt for template if not provided
  if (!template) {
    template = await select('Select a template:', TEMPLATES);
  }

  // Validate template
  if (!TEMPLATES.includes(template)) {
    logError(`Unknown template "${template}". Available: ${TEMPLATES.join(', ')}`);
    process.exit(1);
  }

  log('');
  logInfo(`Creating ${color(projectName, 'bright')} with ${color(template, 'cyan')} template...`);
  log('');

  // Copy template files
  const templatesDir = join(__dirname, '..', 'templates', template);

  if (!existsSync(templatesDir)) {
    logError(`Template directory not found: ${templatesDir}`);
    process.exit(1);
  }

  try {
    copyDir(templatesDir, targetDir, projectName);
    logSuccess('Project files created');
  } catch (err) {
    logError(`Failed to create project: ${err.message}`);
    process.exit(1);
  }

  // Create .gitignore
  const gitignoreContent = `# Dependencies
node_modules/

# Build output
dist/

# Environment
.env
.env.local

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Logs
*.log
`;
  writeFileSync(join(targetDir, '.gitignore'), gitignoreContent);
  logSuccess('.gitignore created');

  // Print success message
  log('');
  log(color('Done! 🎉', 'green'));
  log('');
  log('Next steps:');
  log('');
  log(color(`  cd ${projectName}`, 'cyan'));
  log(color('  npm install', 'cyan'));
  log(color('  npm run dev', 'cyan'));
  log('');
  log(color('Note:', 'yellow') + ' HTTPS is required for geolocation. The dev server uses a self-signed certificate.');
  log('      You may need to accept the browser security warning.');
  log('');
}

main().catch((err) => {
  logError(err.message);
  process.exit(1);
});
