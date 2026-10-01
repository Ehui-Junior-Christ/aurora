// Usage: node --import ./tests/mix/register.mjs tests/mix/<name>.test.ts
// (tempo, key, structure, planner, sync — synthetic-signal accuracy tests).
// Lets Node run the TypeScript sources of src/lib/mix directly (native type
// stripping) by resolving extensionless relative imports to ".ts".
import { register } from "node:module";

register("./resolve-ts.mjs", import.meta.url);
