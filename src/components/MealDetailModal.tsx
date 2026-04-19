import React, { useState } from 'react';
import { db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { X, Loader2, Wrench, Send, AlertCircle, Utensils } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Meal } from '../types';
import { GoogleGenAI } from '@google/genai';
import { format } from 'date-fns';

interface MealDetailModalProps {
  userId: string;
  meal: Meal;
  onClose: () => void;
  onUpdated: (updatedMeal: Meal) => void;
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function MealDetailModal({ userId, meal, onClose, onUpdated }: MealDetailModalProps) {
  const [servings, setServings] = useState(meal.servings || 1);
  const [showFixIssue, setShowFixIssue] = useState(false);
  const [issueText, setIssueText] = useState('');
  const [fixing, setFixing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ensureDate = (ts: any): Date => {
    if (!ts) return new Date();
    if (ts instanceof Date) return ts;
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    if (typeof ts === 'string' || typeof ts === 'number') return new Date(ts);
    return new Date();
  };

  const updateServings = async (newServings: number) => {
    if (newServings < 1 || newServings === servings) return;
    
    // We already have scaling in the UI but this assumes base values or total values?
    // the logging saved TOTAL values per the servings requested. Let's recalculate based on change ratio.
    const ratio = newServings / servings;
    const updatedData: Partial<Meal> = {
      servings: newServings,
      calories: Math.round(meal.calories * ratio),
      protein: Math.round(meal.protein * ratio),
      carbs: Math.round(meal.carbs * ratio),
      fats: Math.round(meal.fats * ratio),
      ingredients: meal.ingredients?.map(ing => ({
        ...ing,
        calories: Math.round(ing.calories * ratio)
      }))
    };

    setServings(newServings);

    const docRef = doc(db, 'users', userId, 'meals', meal.id!);
    await updateDoc(docRef, updatedData);
    
    onUpdated({ ...meal, ...updatedData });
  };

  const handleFixIssue = async () => {
    if (!issueText.trim()) return;
    setFixing(true);
    setError(null);

    const fixPrompt = `The user logged this meal: ${meal.name} with ${meal.calories} calories.
    They say there is an issue: "${issueText}".
    Please recalculate and return corrected nutrition data in this exact JSON format:
    { "name": "", "calories": 0, "protein": 0, "carbs": 0, "fats": 0, "ingredients": [{ "name": "", "calories": 0 }] }
    Only return the JSON, nothing else.`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: fixPrompt }] }]
      });

      const content = response.text;
      if (!content) throw new Error('Empty response from Gemini AI');

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const fixedData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

      if (!fixedData) {
        throw new Error('Could not parse response');
      }

      // the response returns base values for what they asked.
      // apply standard servings to it (maybe they meant for the whole meal, so keep servings as 1 now, or multiply)
      // Actually we will reset servings to 1, or assume response is for the requested servings.
      const updatedData: Partial<Meal> = {
        name: fixedData.name,
        calories: fixedData.calories,
        protein: fixedData.protein,
        carbs: fixedData.carbs,
        fats: fixedData.fats,
        ingredients: fixedData.ingredients || [],
        servings: 1 // reset to 1
      };

      const docRef = doc(db, 'users', userId, 'meals', meal.id!);
      await updateDoc(docRef, updatedData);
      
      onUpdated({ ...meal, ...updatedData });
      setServings(1);
      setShowFixIssue(false);
      setIssueText('');
    } catch (err: any) {
      console.error(err);
      setError('Failed to fix issue: ' + (err.message || 'Unknown error'));
    } finally {
      setFixing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:p-4 sm:items-center backdrop-blur-sm px-4 pb-4 pt-10"
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="w-full max-w-lg max-h-[95vh] flex flex-col"
      >
        <Card className="rounded-[32px] border-[#E8E6E0] dark:border-[#3D3D3A] bg-[#F8F7F2] dark:bg-[#1a1a18] shadow-2xl overflow-hidden p-0 flex flex-col flex-1 max-h-[90vh]">
          {/* Header Image */}
          <div className="relative h-48 sm:h-64 shrink-0 bg-[#E8E6E0] w-full">
            {meal.imageUrl ? (
              <img src={meal.imageUrl} alt={meal.name} className="w-full h-full object-cover" />
            ) : (
               <div className="w-full h-full flex items-center justify-center bg-white dark:bg-[#2D2D2A]"><Utensils className="h-12 w-12 text-[#E8E6E0]" /></div>
            )}
            <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/40 to-transparent flex justify-end">
              <Button size="icon" onClick={onClose} className="rounded-full bg-black/40 text-white hover:bg-black/60 shadow-none border-none">
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="overflow-y-auto no-scrollbar flex-1 p-6 sm:p-8 space-y-8">
            <div>
              <div className="flex justify-between items-start gap-4">
                <div>
                  <h3 className="text-3xl font-serif font-bold text-[#2D2D2A] dark:text-[#F8F7F2]">{meal.name}</h3>
                  <p className="text-[#8E8D8A] mt-1">{format(ensureDate(meal.timestamp), 'h:mm a')}</p>
                </div>
                <div className="text-right shrink-0 bg-white dark:bg-[#2D2D2A] px-4 py-2 rounded-2xl shadow-sm border border-[#E8E6E0] dark:border-[#3D3D3A]">
                  <p className="text-3xl font-bold text-[#5A6E4B]">{meal.calories}</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#8E8D8A]">kcal</p>
                </div>
              </div>
            </div>

            {/* Servings Control */}
            <div className="flex items-center justify-between bg-white dark:bg-[#2D2D2A] p-4 rounded-2xl border border-[#E8E6E0] dark:border-[#3D3D3A]">
              <span className="font-bold text-[#8E8D8A]">Servings</span>
              <div className="flex items-center gap-4 bg-[#F8F7F2] dark:bg-[#1a1a18] rounded-xl p-1">
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => updateServings(servings - 1)}>-</Button>
                <span className="text-lg font-bold w-6 text-center">{servings}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => updateServings(servings + 1)}>+</Button>
              </div>
            </div>

            {/* Macros */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white dark:bg-[#2D2D2A] p-4 rounded-2xl border border-[#E8E6E0] dark:border-[#3D3D3A] text-center">
                <p className="text-[#E57373] text-xs font-black uppercase tracking-widest mb-1">Protein</p>
                <p className="text-xl font-bold">{meal.protein}g</p>
              </div>
              <div className="bg-white dark:bg-[#2D2D2A] p-4 rounded-2xl border border-[#E8E6E0] dark:border-[#3D3D3A] text-center">
                <p className="text-[#81C784] text-xs font-black uppercase tracking-widest mb-1">Carbs</p>
                <p className="text-xl font-bold">{meal.carbs}g</p>
              </div>
              <div className="bg-white dark:bg-[#2D2D2A] p-4 rounded-2xl border border-[#E8E6E0] dark:border-[#3D3D3A] text-center">
                <p className="text-[#FFB74D] text-xs font-black uppercase tracking-widest mb-1">Fats</p>
                <p className="text-xl font-bold">{meal.fats}g</p>
              </div>
            </div>

            {/* Ingredients */}
            {meal.ingredients && meal.ingredients.length > 0 && (
              <div className="space-y-4">
                <h4 className="font-serif text-xl font-bold text-[#2D2D2A] dark:text-[#F8F7F2]">Ingredients</h4>
                <div className="space-y-2">
                  {meal.ingredients.map((ing, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-white dark:bg-[#2D2D2A] p-4 rounded-2xl border border-[#E8E6E0] dark:border-[#3D3D3A]">
                      <span className="font-medium text-[#2D2D2A] dark:text-[#F8F7F2]">{ing.name}</span>
                      <span className="text-[#8E8D8A] font-bold">{ing.calories} kcal</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fix Issue */}
            <div className="pt-4 border-t border-[#E8E6E0] dark:border-[#3D3D3A]">
              <AnimatePresence>
                {!showFixIssue ? (
                  <Button variant="ghost" className="w-full gap-2 text-[#8E8D8A] hover:bg-[#F1F3EE] dark:bg-[#3D3D3A] hover:text-[#2D2D2A] dark:text-[#F8F7F2]" onClick={() => setShowFixIssue(true)}>
                    <Wrench className="h-4 w-4" /> Something wrong with the nutrition?
                  </Button>
                ) : (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-4">
                    <p className="text-sm font-bold">Describe what needs fixing:</p>
                    <textarea 
                      className="w-full p-4 rounded-2xl border border-[#E8E6E0] dark:border-[#3D3D3A] bg-white dark:bg-[#2D2D2A] resize-none h-24 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A6E4B]/20"
                      placeholder="e.g. 'It was actually a double cheeseburger' or 'Missing 2 slices of bacon'"
                      value={issueText}
                      onChange={e => setIssueText(e.target.value)}
                    />
                    {error && (
                      <div className="flex items-center gap-2 text-[#E57373] text-sm bg-red-50 p-3 rounded-xl border border-red-100">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <p>{error}</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowFixIssue(false)}>Cancel</Button>
                      <Button className="flex-1 rounded-xl bg-[#5A6E4B] hover:bg-[#4A5E3B] text-white" disabled={fixing || !issueText.trim()} onClick={handleFixIssue}>
                        {fixing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-2" /> Fix</>}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}
