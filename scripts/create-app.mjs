// Compatibility entry point. New copies use independent Existing and Future templates.
import { runCreateInstance } from './create-instance.mjs';
await runCreateInstance(process.argv.slice(2), { legacy: true });
