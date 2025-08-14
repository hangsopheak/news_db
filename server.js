import fs from 'fs';
import path from 'path';
import jsonServer from 'json-server';
import fetch from 'node-fetch';
import { put, list } from '@vercel/blob';

const server = jsonServer.create();
const middlewares = jsonServer.defaults();
const port = process.env.PORT || 3000;

server.use(middlewares);

// Vercel Blob settings
const BLOB_FOLDER = 'db';

// Validate GUID format
function isValidGUID(guid) {
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return guidRegex.test(guid);
}

async function getDBFromBlob(dbName) {
  const key = `${BLOB_FOLDER}/${dbName}.json`;
  const blobs = await list({ prefix: key });

  if (blobs.blobs.length > 0) {
    const url = blobs.blobs[0].url;
    const res = await fetch(url);
    return await res.json();
  }
  return null;
}

async function saveDBToBlob(dbName, data) {
  const key = `${BLOB_FOLDER}/${dbName}.json`;
  await put(key, JSON.stringify(data, null, 2), {
    access: 'public',
    token: process.env.BLOB_READ_WRITE_TOKEN,
    contentType: 'application/json'
  });
}

server.use(async (req, res, next) => {
  const dbName = req.header('X-DB-NAME');
  
  if (!dbName) {
    return res.status(400).json({ error: 'X-DB-NAME header is required' });
  }
  
  if (!isValidGUID(dbName)) {
    return res.status(400).json({ error: 'X-DB-NAME must be a valid GUID' });
  }

  // Load DB from blob or create from template
  let dbData = await getDBFromBlob(dbName);
  if (!dbData) {
    let templatePath = path.join(__dirname, 'template.json');
    if (fs.existsSync(templatePath)) {
      dbData = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    } else {
      dbData = {};
    }
    await saveDBToBlob(dbName, dbData);
  }

  // Intercept write operations to update blob
  res.on('finish', async () => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const router = jsonServer.router(dbData);
      await saveDBToBlob(dbName, router.db.getState());
    }
  });

  const router = jsonServer.router(dbData);
  router(req, res, next);
});

server.listen(port, () => {
  console.log(`JSON Server running with Vercel Blob storage on port ${port}`);
});
