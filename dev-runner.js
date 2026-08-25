#!/usr/bin/env node

/**
 * DoctorNow Backend - Multi-Service Parallel Dev Runner
 * 
 * Runs API Gateway and all backend microservices simultaneously in a single terminal
 * with colored prefixes, formatted timestamps, port overview, and clean Windows process cleanup.
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ANSI Color Codes
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgBlue: '\x1b[44m\x1b[37m\x1b[1m',
  bgMagenta: '\x1b[45m\x1b[37m\x1b[1m',
  bgCyan: '\x1b[46m\x1b[30m\x1b[1m',
  bgGreen: '\x1b[42m\x1b[30m\x1b[1m',
  bgYellow: '\x1b[43m\x1b[30m\x1b[1m',
  bgRed: '\x1b[41m\x1b[37m\x1b[1m',
  bgWhite: '\x1b[47m\x1b[30m\x1b[1m',
};

// Registered services configuration
const ALL_SERVICES = [
  {
    id: 'gateway',
    name: 'GATEWAY',
    dir: 'api-gateway',
    script: 'start:dev',
    port: 8080,
    color: c.bgBlue,
    isCore: true,
    description: 'API Gateway (NestJS)'
  },
  {
    id: 'auth',
    name: 'AUTH',
    dir: 'services/auth-service',
    script: 'start:dev',
    port: 3001,
    color: c.bgMagenta,
    isCore: true,
    description: 'Authentication & Authorization'
  },
  {
    id: 'profile',
    name: 'PROFILE',
    dir: 'services/profile-service',
    script: 'dev',
    port: 5000,
    color: c.bgCyan,
    isCore: true,
    description: 'User, Doctor & Patient Profiles'
  },
  {
    id: 'appointment',
    name: 'APPOINTMENT',
    dir: 'services/appointment-service',
    script: 'dev',
    port: 3003,
    color: c.bgGreen,
    isCore: true,
    description: 'Appointments & Scheduling'
  },
  {
    id: 'consultation',
    name: 'CONSULTATION',
    dir: 'services/consultation-service',
    script: 'dev',
    port: 3005,
    color: c.bgYellow,
    isCore: true,
    description: 'Consultations & Sessions'
  },
  {
    id: 'medical-records',
    name: 'RECORDS',
    dir: 'services/medical-records-service',
    script: 'dev',
    port: 3004,
    color: c.bgRed,
    isCore: true,
    description: 'Medical Records & Prescriptions'
  },
  {
    id: 'notification',
    name: 'NOTIF',
    dir: 'services/notification-service',
    script: 'dev',
    port: 3008,
    color: c.bgWhite,
    isCore: false,
    description: 'Notifications & Alerts'
  },
  {
    id: 'hospital-admin',
    name: 'HOSPITAL',
    dir: 'services/hospital-admin-service',
    script: 'dev',
    port: 3009,
    color: c.bgGreen,
    isCore: false,
    description: 'Hospital Administration'
  },
  {
    id: 'super-admin',
    name: 'SUPERADMIN',
    dir: 'services/super-admin-service',
    script: 'dev',
    port: 5001,
    color: c.bgMagenta,
    isCore: false,
    description: 'Super Admin Management'
  },
  {
    id: 'video-chat',
    name: 'VIDEO',
    dir: 'services/video-chat-service',
    script: 'dev',
    port: 3007,
    color: c.bgCyan,
    isCore: false,
    description: 'Video Chat & WebRTC'
  },
  {
    id: 'payment',
    name: 'PAYMENT',
    dir: 'services/payment-insurance-service',
    script: 'dev',
    port: 3006,
    color: c.bgYellow,
    isCore: false,
    description: 'Payment, Insurance & Cerner FHIR'
  }
];

// Parse command line arguments
const args = process.argv.slice(2);

function showHelp() {
  console.log(`
${c.bold}${c.cyan}DoctorNow Backend Services Runner${c.reset}

${c.bold}USAGE:${c.reset}
  npm start                       Start all microservices & API Gateway
  npm run dev                     Start all services using concurrently
  node dev-runner.js [options]    Custom launch options

${c.bold}OPTIONS:${c.reset}
  --all                           Start all services (default)
  --core                          Start only core services (Gateway, Auth, Profile, Appt, Consult, Records)
  --only=<svc1,svc2,...>          Start specific services by ID (e.g. --only=gateway,auth,profile)
  --exclude=<svc1,svc2,...>       Exclude specific services (e.g. --exclude=video,super-admin)
  --list                          List all available services and ports
  --help, -h                      Show this help message

${c.bold}AVAILABLE SERVICE IDS:${c.reset}
${ALL_SERVICES.map(s => `  ${c.cyan}${s.id.padEnd(16)}${c.reset} ${s.name.padEnd(12)} Port: ${String(s.port).padEnd(6)} (${s.description})`).join('\n')}
`);
  process.exit(0);
}

if (args.includes('--help') || args.includes('-h')) {
  showHelp();
}

if (args.includes('--list')) {
  console.log(`\n${c.bold}Registered DoctorNow Microservices:${c.reset}`);
  console.table(ALL_SERVICES.map(s => ({
    ID: s.id,
    Name: s.name,
    Port: s.port,
    Core: s.isCore ? 'Yes' : 'No',
    Directory: s.dir,
    Description: s.description
  })));
  process.exit(0);
}

// Determine which services to run
let selectedServices = [...ALL_SERVICES];

if (args.includes('--core')) {
  selectedServices = ALL_SERVICES.filter(s => s.isCore);
}

const onlyArg = args.find(a => a.startsWith('--only=') || a.startsWith('--services='));
if (onlyArg) {
  const ids = onlyArg.split('=')[1].split(',').map(s => s.trim().toLowerCase());
  selectedServices = ALL_SERVICES.filter(s => ids.includes(s.id.toLowerCase()) || ids.includes(s.name.toLowerCase()));
}

const excludeArg = args.find(a => a.startsWith('--exclude='));
if (excludeArg) {
  const ids = excludeArg.split('=')[1].split(',').map(s => s.trim().toLowerCase());
  selectedServices = selectedServices.filter(s => !ids.includes(s.id.toLowerCase()) && !ids.includes(s.name.toLowerCase()));
}

// Filter only existing service directories
const rootDir = process.cwd();
const activeServices = selectedServices.filter(s => {
  const servicePath = path.join(rootDir, s.dir);
  const pkgPath = path.join(servicePath, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    console.log(`${c.yellow}⚠️  Skipping ${s.name} (${s.dir}) - package.json not found.${c.reset}`);
    return false;
  }
  return true;
});

if (activeServices.length === 0) {
  console.error(`${c.red}❌ No valid services found to start.${c.reset}`);
  process.exit(1);
}

// Print Banner
console.clear();
console.log(`${c.bold}${c.cyan}====================================================================${c.reset}`);
console.log(`${c.bold}${c.cyan}      🚀  DoctorNow Platform - Multi-Service Backend Runner       ${c.reset}`);
console.log(`${c.bold}${c.cyan}====================================================================${c.reset}`);
console.log(`${c.dim}Starting ${activeServices.length} service(s) in parallel...${c.reset}\n`);

activeServices.forEach(s => {
  console.log(`  ${s.color} ${s.name.padEnd(11)} ${c.reset}  ${c.bold}http://localhost:${s.port}${c.reset}  ${c.dim}(${s.dir})${c.reset}`);
});

console.log(`\n${c.gray}Press ${c.bold}Ctrl + C${c.reset}${c.gray} at any time to gracefully terminate all services.${c.reset}`);
console.log(`${c.bold}${c.cyan}--------------------------------------------------------------------${c.reset}\n`);

// Track spawned processes
const childProcesses = [];
const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

// Line buffering helper to print neat prefixed lines
function attachPrefixedStream(stream, service, isError = false) {
  let buffer = '';
  stream.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop(); // keep remainder
    for (const line of lines) {
      if (line.trim().length > 0) {
        const time = new Date().toLocaleTimeString();
        const prefix = `${service.color} ${service.name.padEnd(10)} ${c.reset} ${c.gray}${time}${c.reset}`;
        const outputLine = isError ? `${c.red}${line}${c.reset}` : line;
        console.log(`${prefix} ${outputLine}`);
      }
    }
  });
}

// Spawn all services
activeServices.forEach(service => {
  const serviceDir = path.join(rootDir, service.dir);

  try {
    const child = spawn(npmCmd, ['run', service.script], {
      cwd: serviceDir,
      shell: true,
      env: { ...process.env, FORCE_COLOR: 'true' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    childProcesses.push({ service, child });

    attachPrefixedStream(child.stdout, service, false);
    attachPrefixedStream(child.stderr, service, true);

    child.on('error', (err) => {
      console.error(`${service.color} ${service.name} ${c.reset} ${c.red}Failed to start: ${err.message}${c.reset}`);
    });

    child.on('exit', (code, signal) => {
      if (code !== 0 && code !== null) {
        console.log(`${service.color} ${service.name} ${c.reset} ${c.yellow}Exited with code ${code}${c.reset}`);
      }
    });
  } catch (err) {
    console.error(`${c.red}Error spawning ${service.name}: ${err.message}${c.reset}`);
  }
});

// Cleanup logic for clean shutdown
let isShuttingDown = false;

function cleanShutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n\n${c.yellow}⚠️  Shutting down all DoctorNow services...${c.reset}`);

  childProcesses.forEach(({ service, child }) => {
    if (child && child.pid) {
      try {
        if (isWindows) {
          // On Windows, taskkill kills the entire process tree (/T) forcefully (/F)
          execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: 'ignore' });
        } else {
          child.kill('SIGTERM');
        }
      } catch (e) {
        // Process might already be closed
      }
    }
  });

  console.log(`${c.green}✅ All services stopped successfully.${c.reset}`);
  process.exit(0);
}

process.on('SIGINT', cleanShutdown);
process.on('SIGTERM', cleanShutdown);
process.on('exit', cleanShutdown);
