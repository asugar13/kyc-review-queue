import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { CaseRepository, ConflictError, NotFoundError, ValidationError } from './db.ts';
import { CASE_STATUSES, DECISION_ACTIONS, REVIEWERS } from './types.ts';

export interface AppOptions {
  db: DatabaseSync;
  clientDist?: string;
}

export function createApp({ db, clientDist }: AppOptions): Express {
  const repo = new CaseRepository(db);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  const api = express.Router();

  api.get('/health', (_req, res) => {
    res.json({ ok: true, cases: repo.count() });
  });

  api.get('/meta', (_req, res) => {
    res.json({ statuses: CASE_STATUSES, actions: DECISION_ACTIONS, reviewers: REVIEWERS });
  });

  api.get('/cases', (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    if (status && status !== 'all' && !(CASE_STATUSES as readonly string[]).includes(status)) {
      throw new ValidationError(`status must be one of: all, ${CASE_STATUSES.join(', ')}`, 'status');
    }
    res.json(repo.listQueue({ status, q }));
  });

  api.get('/cases/:id', (req, res) => {
    res.json(repo.getDetail(String(req.params.id)));
  });

  api.post('/cases/:id/decisions', (req, res) => {
    const detail = repo.applyDecision(String(req.params.id), req.body);
    res.status(201).json(detail);
  });

  api.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use('/api', api);

  if (clientDist && existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(join(clientDist, 'index.html'));
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ValidationError) {
      res.status(err.status).json({ error: err.message, field: err.field });
      return;
    }
    if (err instanceof NotFoundError || err instanceof ConflictError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (isBodyParseError(err)) {
      res.status(400).json({ error: 'Malformed JSON body' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

function isBodyParseError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'type' in err && err.type === 'entity.parse.failed';
}
