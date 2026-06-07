import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
  IMAGES: R2Bucket;
  ANTHROPIC_API_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors());

app.get('/', (c) => c.json({ ok: true }));

export default app;
