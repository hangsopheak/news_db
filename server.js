import fs from 'fs';
import path from 'path';
import jsonServer from 'json-server';
import fetch from 'node-fetch';
import { put, list } from '@vercel/blob';
import { fileURLToPath } from 'url';

// Fix __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = jsonServer.create();
const middlewares = jsonServer.defaults();
const port = process.env.PORT || 3000;

// Folder in Blob where we store databases
const BLOB_FOLDER = 'db';

// Validate GUID format
function isValidGUID(guid) {
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return guidRegex.test(guid);
}

// Load DB from Blob - get the latest version
async function getDBFromBlob(dbName) {
  try {
    const prefix = `${BLOB_FOLDER}/${dbName}`;
    const blobs = await list({ 
      prefix: prefix, 
      token: process.env.BLOB_READ_WRITE_TOKEN,
      limit: 100 // Get more results to find the latest
    });
    
    if (blobs.blobs.length > 0) {
      // Sort by uploadedAt to get the most recent version
      const latestBlob = blobs.blobs
        .filter(blob => blob.pathname.includes(`${dbName}.json`))
        .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0];
      
      if (latestBlob) {
        console.log(`Loading latest DB version: ${latestBlob.pathname}`);
        const res = await fetch(latestBlob.url);
        if (res.ok) {
          return await res.json();
        }
      }
    }
    
    return null;
  } catch (error) {
    console.log(`No existing DB found for ${dbName}:`, error.message);
    return null;
  }
}

// Save DB to Blob
async function saveDBToBlob(dbName, data) {
  const key = `${BLOB_FOLDER}/${dbName}.json`;
  
  try {
    const blob = await put(key, JSON.stringify(data, null, 2), {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType: 'application/json',
      // Add metadata to help with versioning
      addRandomSuffix: false // This prevents random suffixes
    });
    
    console.log(`Saved DB ${dbName} to blob: ${blob.pathname}`);
    return blob;
  } catch (error) {
    console.error(`Failed to save DB ${dbName}:`, error);
    throw error;
  }
}

server.use(middlewares);

server.use(async (req, res, next) => {
  const dbName = req.header('X-DB-NAME');
  
  if (!dbName) {
    return res.status(400).json({ error: 'X-DB-NAME header is required' });
  }
  
  if (!isValidGUID(dbName)) {
    return res.status(400).json({ error: 'X-DB-NAME must be a valid GUID' });
  }
  
  try {
    // Load DB from blob or initialize from template
    let dbData = await getDBFromBlob(dbName);
    
    if (!dbData) {
      const templatePath = path.join(__dirname, 'template.json');
      if (fs.existsSync(templatePath)) {
        dbData = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
        console.log(`Initialized DB ${dbName} from template`);
      } else {
        dbData = {};
        console.log(`Initialized empty DB ${dbName}`);
      }
      await saveDBToBlob(dbName, dbData);
    }
    
    // Create router with loaded data
    const router = jsonServer.router(dbData);
    
    // Capture DB state after any write request
    res.on('finish', async () => {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        try {
          await saveDBToBlob(dbName, router.db.getState());
        } catch (error) {
          console.error(`Failed to save changes for DB ${dbName}:`, error);
        }
      }
    });
    
    router(req, res, next);
  } catch (error) {
    console.error(`Error handling request for DB ${dbName}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

server.listen(port, () => {
  console.log(`JSON Server with Vercel Blob storage running on port ${port}`);
});