import { collection, addDoc, serverTimestamp, Timestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { GoogleGenAI } from '@google/genai';

export interface BackgroundAnalysis {
  status: 'analyzing' | 'success' | 'error';
  mealName?: string;
  calories?: number;
  errorMsg?: string;
}

export const analyzeAndLogMeal = async (
  userId: string,
  file: File,
  targetDate: Date,
  onStatusChange: (status: BackgroundAnalysis) => void,
  onComplete: () => void
) => {
  onStatusChange({ status: 'analyzing' });
  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured.');
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    // Read to base64
    const reader = new FileReader();
    const base64Promise = new Promise<string>((resolve) => {
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.readAsDataURL(file);
    });

    const base64 = await base64Promise;

    const prompt = `You are a professional nutritionist and food recognition AI with expertise in portion estimation.

Analyze this food image carefully:
- Identify every food item visible
- Estimate portion sizes by comparing to plate size, utensils, hands, or standard serving sizes
- Account for cooking method (fried, boiled, grilled affects calories significantly)
- If it's a restaurant dish, use typical restaurant portion sizes
- Be slightly conservative with estimates
- Use USDA nutrition database values as reference

Return ONLY a valid JSON object, no markdown, no explanation:
{
  "name": "specific descriptive food name",
  "portion": "estimated portion (e.g. 300g, 1 large plate)",
  "calories": 0,
  "protein": 0,
  "carbs": 0,
  "fats": 0,
  "confidence": "high or medium or low",
  "ingredients": [
    {"name": "ingredient name", "calories": 0}
  ]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{
        parts: [
          { text: prompt },
          { 
            inlineData: { 
              data: base64, 
              mimeType: file.type || 'image/jpeg' 
            } 
          }
        ]
      }]
    });

    const content = response.text;
    if (!content) throw new Error('Empty response from Gemini AI');

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const foodData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    if (!foodData) {
      throw new Error('Could not parse Gemini response');
    }

    // Compress image
    let compressedBase64 = null;
    const compressImage = (): Promise<string | null> => {
      return new Promise((resolve) => {
        const r2 = new FileReader();
        r2.onload = (e) => {
          const dataUrl = e.target?.result as string;
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 400;
            canvas.height = 400;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              const aspect = img.width / img.height;
              let drawWidth, drawHeight, offsetX, offsetY;
              if (aspect > 1) {
                drawHeight = 400;
                drawWidth = 400 * aspect;
                offsetX = -(drawWidth - 400) / 2;
                offsetY = 0;
              } else {
                drawWidth = 400;
                drawHeight = 400 / aspect;
                offsetX = 0;
                offsetY = -(drawHeight - 400) / 2;
              }
              ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
              const compressed = canvas.toDataURL('image/jpeg', 0.6);
              if (compressed.length < 1000000) {
                resolve(compressed);
              } else {
                resolve(null);
              }
            } else {
              resolve(null);
            }
          };
          img.onerror = () => resolve(null);
          img.src = dataUrl;
        };
        r2.readAsDataURL(file);
      });
    };
    compressedBase64 = await compressImage();

    const now = new Date();
    const logDate = new Date(targetDate);
    logDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    const timestamp = Timestamp.fromDate(logDate);

    const mealData: any = {
      name: foodData.name,
      calories: foodData.calories,
      protein: foodData.protein,
      carbs: foodData.carbs,
      fats: foodData.fats,
      ingredients: foodData.ingredients || [],
      servings: 1,
      portion: foodData.portion,
      confidence: foodData.confidence,
      timestamp: timestamp,
      createdAt: serverTimestamp(),
    };
    
    if (compressedBase64) {
      mealData.imageUrl = compressedBase64;
    }

    await addDoc(collection(db, 'users', userId, 'meals'), mealData);

    try {
      const { format } = await import('date-fns');
      const streakRef = doc(db, 'users', userId, 'streak', 'default');
      const streakDoc = await getDoc(streakRef);
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      
      if (streakDoc.exists()) {
        const data = streakDoc.data();
        if (data.lastLoggedDate !== todayStr) {
          const isYesterday = new Date(data.lastLoggedDate).getTime() === new Date(todayStr).getTime() - 86400000;
          const newCount = isYesterday ? (data.currentCount || 0) + 1 : 1;
          const newBest = Math.max(newCount, data.bestCount || 0);
          await setDoc(streakRef, {
            currentCount: newCount,
            bestCount: newBest,
            lastLoggedDate: todayStr,
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
      } else {
        await setDoc(streakRef, {
          currentCount: 1,
          bestCount: 1,
          lastLoggedDate: todayStr,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    } catch (e) {
      console.error('Streak update error:', e);
    }

    onStatusChange({
      status: 'success',
      mealName: foodData.name,
      calories: foodData.calories
    });

    onComplete();
  } catch (err: any) {
    console.error('Background analysis error:', err);
    onStatusChange({
      status: 'error',
      errorMsg: err.message || 'Error communicating with Gemini AI'
    });
  }
};
