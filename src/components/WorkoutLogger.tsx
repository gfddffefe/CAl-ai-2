import React, { useState } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { WorkoutIntensity, UserProfile } from '../types';
import { X, Loader2, Dumbbell, Trophy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from '@google/genai';

interface WorkoutLoggerProps {
  profile: UserProfile;
  onClose: () => void;
  onLogged: () => void;
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const categories = [
  {
    name: '🏃 Cardio',
    activities: ['Treadmill', 'Elliptical', 'Stationary Bike', 'Rowing Machine', 'Stairmaster', 'Jump Rope']
  },
  {
    name: '🏋️ Strength',
    activities: ['Powerlifting', 'Bodybuilding', 'CrossFit', 'Calisthenics', 'Olympic Weightlifting']
  },
  {
    name: '🤸 Flexibility',
    activities: ['Yoga', 'Pilates', 'Stretching']
  },
  {
    name: '🥊 Sports',
    activities: ['Boxing / MMA', 'Basketball', 'Football', 'Swimming']
  }
];

export default function WorkoutLogger({ profile, onClose, onLogged }: WorkoutLoggerProps) {
  const [activeCategory, setActiveCategory] = useState(categories[0].name);
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null);
  
  const [duration, setDuration] = useState('30');
  const [intensity, setIntensity] = useState<WorkoutIntensity>('moderate');
  const [weight, setWeight] = useState(profile.weight?.toString() || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculateAndLog = async () => {
    if (!selectedActivity || !duration || !weight) {
      setError('Please select an activity and fill in all fields');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const weightNum = parseFloat(weight);
      if (isNaN(weightNum)) throw new Error('Invalid weight');

      const fullCategory = categories.find(c => c.activities.includes(selectedActivity))?.name || 'Workout';
      
      const prompt = `A person weighing ${weightNum}kg did ${selectedActivity} for ${duration} minutes at ${intensity} intensity.
How many calories did they burn?
Rules:
- Reply with ONLY a single positive integer number
- No text, no units, no explanation
- Must be between 50 and 2000
- Example correct answer: 245`;
      
      console.log('--- GEMINI PROMPT ---', prompt);

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });

      const resultText = response.text || '0';
      const calories = parseInt(resultText.trim());

      let finalCalories = calories;

      // Validate — calories burned must be a positive reasonable number
      if (isNaN(calories) || calories <= 0 || calories > 5000) {
        console.warn('Invalid calorie response from Gemini: ' + response.text + ', falling back to MET calculation');
        
        const MET_VALUES: Record<string, number> = {
          'Elliptical': 5.0,
          'Treadmill': 8.0,
          'Stationary Bike': 6.8,
          'Rowing Machine': 7.0,
          'Powerlifting': 6.0,
          'Bodybuilding': 5.0,
          'CrossFit': 8.0,
          'Boxing / MMA': 9.8,
          'Swimming': 7.0,
          'default': 5.0
        };
        const met = MET_VALUES[selectedActivity] || MET_VALUES['default'];
        finalCalories = Math.round((met * weightNum * parseInt(duration)) / 60);
      }

      // Update weight in profile if changed
      if (Math.abs(weightNum - (profile.currentWeight || profile.weight)) > 0.1) {
        await updateDoc(doc(db, 'users', profile.userId), {
          weight: weightNum,
          currentWeight: weightNum,
          updatedAt: serverTimestamp()
        });
      }

      await addDoc(collection(db, 'users', profile.userId, 'workouts'), {
        type: selectedActivity,
        duration: parseInt(duration),
        intensity,
        caloriesBurned: finalCalories,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp()
      });

      onLogged();
      onClose();
    } catch (err: any) {
      console.error('Workout Log Error:', err);
      setError(err.message || 'Failed to calculate calories. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:p-4 sm:items-center backdrop-blur-sm"
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="w-full max-w-md h-[95vh] sm:h-auto overflow-hidden flex flex-col"
      >
        <Card className="rounded-t-[32px] sm:rounded-[32px] border-[#E8E6E0] dark:border-[#3D3D3A] bg-white dark:bg-[#2D2D2A] shadow-2xl flex flex-col h-full overflow-hidden p-0">
          <CardHeader className="flex flex-row items-center justify-between p-6 pb-2 shrink-0 border-b border-[#F1F3EE]">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#5A6E4B]/10 flex items-center justify-center">
                <Dumbbell className="h-6 w-6 text-[#5A6E4B]" />
              </div>
              <CardTitle className="text-2xl font-serif font-bold text-[#2D2D2A] dark:text-[#F8F7F2]">Log Workout</CardTitle>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-[#F1F3EE] dark:bg-[#3D3D3A]">
              <X className="h-6 w-6 text-[#8E8D8A]" />
            </Button>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto space-y-6 pt-6 p-6">
            
            {/* Categories scrollable horizontally */}
            <div className="space-y-3">
              <Label className="text-xs font-bold uppercase tracking-wider text-[#8E8D8A]">Category</Label>
              <div className="flex overflow-x-auto pb-2 gap-2 hide-scrollbar snap-x">
                {categories.map((cat) => (
                  <button
                    key={cat.name}
                    onClick={() => setActiveCategory(cat.name)}
                    className={`snap-start whitespace-nowrap px-4 py-2.5 rounded-xl font-bold transition-all flex-shrink-0 ${
                      activeCategory === cat.name 
                        ? 'bg-[#2D2D2A] text-white shadow-md scale-100' 
                        : 'bg-[#F8F7F2] dark:bg-[#1a1a18] text-[#8E8D8A] hover:bg-[#F1F3EE] dark:bg-[#3D3D3A] scale-95'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Activities grid */}
            <div className="space-y-3">
              <Label className="text-xs font-bold uppercase tracking-wider text-[#8E8D8A] flex justify-between">
                <span>Select Activity</span>
                {selectedActivity && <span className="text-[#5A6E4B]">{selectedActivity}</span>}
              </Label>
              <AnimatePresence mode="wait">
                <motion.div 
                  key={activeCategory}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.15 }}
                  className="grid grid-cols-2 gap-2"
                >
                  {categories.find(c => c.name === activeCategory)?.activities.map((activity) => (
                    <button
                      key={activity}
                      onClick={() => setSelectedActivity(activity)}
                      className={`text-sm py-3 px-3 rounded-xl border text-left transition-all ${
                        selectedActivity === activity
                          ? 'border-[#5A6E4B] bg-[#5A6E4B]/5 text-[#5A6E4B] font-bold shadow-sm'
                          : 'border-[#E8E6E0] dark:border-[#3D3D3A] bg-white dark:bg-[#2D2D2A] text-[#2D2D2A] dark:text-[#F8F7F2] hover:border-[#2D2D2A]/30'
                      }`}
                    >
                      {activity}
                    </button>
                  ))}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-[#8E8D8A]">Duration (min)</Label>
                <Input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="h-12 rounded-xl text-lg font-bold border-[#E8E6E0] dark:border-[#3D3D3A] bg-[#F8F7F2] dark:bg-[#1a1a18]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-[#8E8D8A]">Body Weight (kg)</Label>
                <Input
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="h-12 rounded-xl text-lg font-bold border-[#E8E6E0] dark:border-[#3D3D3A] bg-[#F8F7F2] dark:bg-[#1a1a18]"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-[#8E8D8A]">Intensity</Label>
              <div className="flex bg-[#F8F7F2] dark:bg-[#1a1a18] p-1 rounded-2xl">
                {(['light', 'moderate', 'intense'] as WorkoutIntensity[]).map((i) => (
                  <button
                    key={i}
                    onClick={() => setIntensity(i)}
                    className={`flex-1 capitalize py-3 rounded-xl text-sm font-bold transition-all ${
                      intensity === i 
                        ? 'bg-white dark:bg-[#2D2D2A] text-[#5A6E4B] shadow-sm' 
                        : 'text-[#8E8D8A] hover:text-[#2D2D2A] dark:text-[#F8F7F2]'
                    }`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 p-3 rounded-xl border border-red-100">{error}</p>
            )}

            <div className="pt-2 pb-6 sm:pb-0">
              <Button
                className="w-full h-14 bg-[#5A6E4B] text-lg font-bold rounded-2xl shadow-lg hover:bg-[#4A5E3B] transition-all disabled:opacity-50"
                onClick={calculateAndLog}
                disabled={loading || !selectedActivity}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-3 h-6 w-6 animate-spin" />
                    Gemini Calculating...
                  </>
                ) : (
                  <>
                    <Trophy className="mr-3 h-6 w-6" />
                    {selectedActivity ? `Log ${selectedActivity}` : 'Select Activity'}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
