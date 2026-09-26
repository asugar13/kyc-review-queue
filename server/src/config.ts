import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const serverRoot = resolve(fileURLToPath(import.meta.url), '../..');

export const PORT = Number(process.env.PORT ?? 3001);
export const DB_PATH = process.env.KYC_DB_PATH ?? resolve(serverRoot, 'data/kyc.sqlite');
export const CLIENT_DIST = resolve(serverRoot, '../client/dist');
