// server.js
import express from 'express';
import bodyParser from 'body-parser';
import { put, list } from '@vercel/blob';
import fetch from 'node-fetch'; // Needed to read blob contents

const app = express();
app.use(bodyParser.json());

const BLOB_FOLDER = 'db/'; // All DB files go here

// Helper: Load DB by name
async function loadDb(dbName) {
  const { blobs } = await list({ prefix: `${BLOB_FOLDER}${dbName}.json` });
  if (blobs.length > 0) {
    const resp = await fetch(blobs[0].url);
    return await resp.json();
  }
  return {}; // If file doesn't exist, start with empty DB
}

// Helper: Save DB by name (overwrite existing file)
async function saveDb(dbName, data) {
  await put(
    `${BLOB_FOLDER}${dbName}.json`,
    JSON.stringify(data, null, 2),
    {
      access: 'public',
      addRandomSuffix: false, // Prevents duplicate files
      allowOverwrite: true
    }
  );
}

// Middleware: Require X-DB-NAME
app.use((req, res, next) => {
  const dbName = req.headers['x-db-name'];
  if (!dbName) {
    return res.status(400).json({ error: 'Missing X-DB-NAME header' });
  }
  req.dbName = dbName;
  next();
});

// GET all data
app.get('/', async (req, res) => {
  const db = await loadDb(req.dbName);
  res.json(db);
});

// POST: Add new entry
app.post('/', async (req, res) => {
  const db = await loadDb(req.dbName);
  const newItem = req.body;
  if (!Array.isArray(db.items)) db.items = [];
  db.items.push(newItem);
  await saveDb(req.dbName, db);
  res.status(201).json(newItem);
});

// PUT: Replace DB
app.put('/', async (req, res) => {
  await saveDb(req.dbName, req.body);
  res.json({ status: 'DB replaced' });
});

// DELETE: Clear DB
app.delete('/', async (req, res) => {
  await saveDb(req.dbName, {});
  res.json({ status: 'DB cleared' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
