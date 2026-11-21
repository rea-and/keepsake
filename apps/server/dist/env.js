import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
// Imported first so the configuration is in place before any other module reads
// process.env at load time (DATA_DIR in store.ts, for example). Loads the
// working directory's .env, then the repository root's, which is where the
// file lives when the server is started through npm workspaces. Variables that
// are already set (systemd, Docker) are never overridden.
dotenv.config();
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env') });
