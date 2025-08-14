import { put, get } from '@vercel/blob';
import jsonServer from 'json-server';
import express from 'express';
import fetch from 'node-fetch';

const server = express();
server.use(express.json());

const middlewares = jsonServer.defaults();
server.use(middlewares);

const port = process.env.PORT || 3000;

// Validate GUID format
function isValidGUID(guid) {
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return guidRegex.test(guid);
}

server.use(async (req, res, next) => {
  const dbName = req.header('X-DB-NAME');
  if (!dbName) return res.status(400).json({ error: 'X-DB-NAME header is required' });
  if (!isValidGUID(dbName)) return res.status(400).json({ error: 'X-DB-NAME must be a valid GUID' });

  const blobPath = `db/${dbName}.json`;

  // Fetch the blob content if exists, otherwise create it
  let dbJson;
  try {
    const existing = await get(blobPath);
    const resp = await fetch(existing.url);
    dbJson = await resp.json();
  } catch {
    // Create from template.json
    dbJson = {};
    await put(blobPath, JSON.stringify(dbJson, null, 2), {
      contentType: 'application/json',
      access: 'public',
    });
  }

  // Create in-memory router
  const router = jsonServer.router(dbJson);

  // Capture save changes on write operations
  res.on('finish', async () => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      await put(blobPath, JSON.stringify(router.db.getState(), null, 2), {
        contentType: 'application/json',
        access: 'public',
      });
    }
  });

  router(req, res, next);
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
