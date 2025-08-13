const fs = require('fs');
const path = require('path');
const jsonServer = require('json-server');
const server = jsonServer.create();
const middlewares = jsonServer.defaults();
const port = process.env.PORT || 3000;

// Writable folder in Vercel: /tmp
const DB_DIR = path.join('/tmp', 'db');
const TEMPLATE_PATH = path.join(__dirname, 'template.json');

// Ensure writable /tmp/db exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

server.use(middlewares);

function isValidGUID(guid) {
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return guidRegex.test(guid);
}

server.use((req, res, next) => {
  const dbName = req.header('X-DB-NAME');
  
  if (!dbName) {
    return res.status(400).json({ error: 'X-DB-NAME header is required' });
  }
  
  if (!isValidGUID(dbName)) {
    return res.status(400).json({ error: 'X-DB-NAME must be a valid GUID' });
  }
  
  const dbPath = path.join(DB_DIR, `${dbName}.json`);
  
  if (!fs.existsSync(dbPath)) {
    if (fs.existsSync(TEMPLATE_PATH)) {
      fs.copyFileSync(TEMPLATE_PATH, dbPath);
    } else {
      fs.writeFileSync(dbPath, JSON.stringify({}, null, 2));
    }
  }
  
  const router = jsonServer.router(dbPath);
  router(req, res, next);
});

server.listen(port, () => {
  console.log(`JSON Server is running on port ${port}`);
});
