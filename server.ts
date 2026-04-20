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
    console.log('Health sync received:', JSON.stringify(req.body).substring(0, 200));

    let userId, steps, activeCalories;

    // Format from Health Auto Export app
    if (req.body.data?.metrics) {
      const metrics = req.body.data.metrics;
      userId = req.body.userId || req.headers['x-user-id'] as string;
      console.log('Final userId:', userId);

      const stepsMetric = metrics.find((m: any) => 
        m.name === 'steps' || m.name === 'step_count' || m.name === 'Steps'
      );
      const caloriesMetric = metrics.find((m: any) => 
        m.name === 'active_energy' || m.name === 'active_calories' || m.name === 'Active Energy'
      );

      const getLocalDateFromSample = (dateStr: string): string => {
        // dateStr example: "2026-04-19 15:27:03 -0400"
        // Just take the date part directly since it's already in local time
        return dateStr.substring(0, 10); // "2026-04-19"
      };

      const todayLocal = getLocalDateFromSample(
        stepsMetric?.data?.[0]?.date || new Date().toISOString()
      );

      // Find the most recent date in the data
      const allDates = stepsMetric?.data?.map((d: any) => d.date?.substring(0, 10)) || [];
      const mostRecentDate = allDates.sort().reverse()[0] || todayLocal;

      steps = Math.round(
        stepsMetric?.data
          ?.filter((d: any) => d.date?.startsWith(mostRecentDate))
          ?.reduce((sum: number, d: any) => sum + (d.qty || 0), 0) || 0
      );

      activeCalories = Math.round(
        caloriesMetric?.data
          ?.filter((d: any) => d.date?.startsWith(mostRecentDate))
          ?.reduce((sum: number, d: any) => sum + (d.qty || 0), 0) || 0
      );

      console.log('Parsed from Health Auto Export - steps:', steps, 'activeCalories:', activeCalories);
      console.log('userId from header:', req.headers['x-user-id']);
      console.log('userId from body:', req.body.userId);
    } else {
      // Original Shortcuts format
      userId = req.body.userId || req.headers['x-user-id'] as string;
      steps = Number(req.body.steps) || 0;
      activeCalories = Number(req.body.activeCalories) || 0;
    }

    if (!userId) {
      res.status(400).json({ error: 'Missing userId — add x-user-id header' });
      return;
    }

    if (!db) {
      res.status(500).json({ error: 'Database not initialized' });
      return;
    }

    try {
      const dateKey = new Date().toISOString().split('T')[0];
      await db.collection('users').doc(userId).collection('health_sync').doc(dateKey).set({
        steps,
        activeCalories,
        syncedAt: new Date().toISOString()
      }, { merge: true });

      res.json({ success: true, steps, activeCalories });
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

