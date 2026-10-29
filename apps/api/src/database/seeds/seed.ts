import { seedCli } from './seed-cli.js';

process.exitCode = await seedCli(process.argv.slice(2), process.env);
