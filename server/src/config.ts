// Single source of runtime configuration. Every file that reads or writes server/data/ MUST use
// DATA_DIR from here: computing it relative to a module's own location breaks the moment the module
// moves, and a wrong path for secret.key means every stored SSH credential becomes undecryptable.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

// server/ is the parent of src/ (and of dist/ when compiled), so resolve from this file once.
const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DATA_DIR = process.env.VPSHUB_DATA_DIR ? path.resolve(process.env.VPSHUB_DATA_DIR) : path.join(SERVER_ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const dataFile = (name: string) => path.join(DATA_DIR, name);

export const config = {
  port: Number(process.env.PORT) || 5001,
  corsOrigin: process.env.CORS_ORIGIN || '',
  dashboardPassword: process.env.DASHBOARD_PASSWORD || ''
};
