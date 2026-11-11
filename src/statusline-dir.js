// Where src/statusline.js stores per-session snapshots (shared with usage.js).
import { homedir } from 'node:os';
import { join } from 'node:path';

export const SNAPSHOT_DIR = process.env.INKGLANCE_STATUS_DIR || join(homedir(), '.config', 'inkglance', 'status');
