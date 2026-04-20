import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin instance
let db: admin.firestore.Firestore;
try {
  let credential;
  
  // Support Service Account credentials if provided
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    credential = admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    });
  }

  const configRaw = fs.existsSync(path.join(__dirname, 'firebase-applet-config.json')) 
    ? fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf-8')
    : "{}";
  const config = JSON.parse(configRaw);
  
  if (admin.apps.length === 0) {
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || config.projectId,
      ...(credential ? { credential } : {})
    });
  }
  
  db = admin.firestore();
  const databaseId = process.env.FIRESTORE_DATABASE_ID || config.firestoreDatabaseId;
if (databaseId) {
    db.settings({ databaseId });
}
} catch (e) {
  console.log('Firebase Admin could not be initialized:', e);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '20mb' }));

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/health-sync', async (req, res) => {
    console.log('Health sync received:', req.body);
    const { userId, steps, activeCalories, date } = req.body;
    
    if (!userId) {
      res.status(400).json({ error: 'Missing userId' });
      return;
    }

    if (!db) {
      res.status(500).json({ error: 'Database not initialized' });
      return;
    }
    
    try {
      const dateKey = new Date().toISOString().split('T')[0];
      
      // Save to Firestore under the user's data for that date
      await db.collection('users').doc(userId).collection('health_sync').doc(dateKey).set({
        steps: Number(steps) || 0,
        activeCalories: Number(activeCalories) || 0,
        syncedAt: new Date().toISOString()
      }, { merge: true });
      
      res.json({ success: true, message: 'Health data synced' });
    } catch (error) {
      console.error('Health sync error:', error);
      res.status(500).json({ error: 'Failed to sync health data' });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});

