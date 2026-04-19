import React, { useState } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, getDocs, limit, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { UserProfile, StepLog } from '../types';
import { X, Footprints, Check, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { calculateStepCalories } from '../lib/calculations';
import { startOfDay } from 'date-fns';

interface StepTrackerProps {
  profile: UserProfile;
  onClose: () => void;
  onLogged: () => void;
}

export default function StepTracker({ profile, onClose, onLogged }: StepTrackerProps) {
  const [steps, setSteps] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveSteps = async () => {
    if (!steps || isNaN(parseInt(steps))) {
      setError('Please enter a valid number of steps.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const stepCount = parseInt(steps);
      const caloriesBurned = calculateStepCalories(stepCount, profile.weight);

      // Check if there's already a log for today to update it instead
      const todayStart = startOfDay(new Date());
      const todayTS = Timestamp.fromDate(todayStart);

      const q = query(
        collection(db, 'users', profile.userId, 'steps'),
        where('timestamp', '>=', todayTS),
        orderBy('timestamp', 'desc'),
        limit(1)
      );
      
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        // Update existing today's log
        const existingDoc = snap.docs[0];
        await updateDoc(doc(db, 'users', profile.userId, 'steps', existingDoc.id), {
          count: stepCount,
          caloriesBurned,
          timestamp: serverTimestamp()
        });
      } else {
        // Create new log
        await addDoc(collection(db, 'users', profile.userId, 'steps'), {
          count: stepCount,
          caloriesBurned,
          timestamp: serverTimestamp(),
          createdAt: serverTimestamp()
        });
      }

      onLogged();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError('Failed to save steps.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center backdrop-blur-sm"
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="w-full max-w-sm"
      >
        <Card className="rounded-t-[32px] sm:rounded-[32px] border-[#E8E6E0] bg-white shadow-2xl overflow-hidden p-0">
          <CardHeader className="flex flex-row items-center justify-between p-8 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#5A6E4B]/10 flex items-center justify-center">
                <Footprints className="h-6 w-6 text-[#5A6E4B]" />
              </div>
              <CardTitle className="text-2xl font-serif font-bold text-[#2D2D2A]">Track Steps</CardTitle>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-[#F1F3EE]">
              <X className="h-6 w-6 text-[#8E8D8A]" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-6 p-8 pt-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-[#8E8D8A]">Steps Today</Label>
              <Input
                type="number"
                placeholder="e.g. 10000"
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
                className="h-14 text-2xl font-bold rounded-2xl border-[#E8E6E0] bg-[#F8F7F2] text-center"
                autoFocus
              />
              <p className="text-center text-xs text-[#8E8D8A]">
                Estimated calorie burn: <span className="font-bold text-[#5A6E4B]">{calculateStepCalories(parseInt(steps) || 0, profile.weight)} kcal</span>
              </p>
            </div>

            {error && <p className="text-sm text-red-500 text-center">{error}</p>}

            <Button
              className="w-full h-14 bg-[#5A6E4B] text-lg font-bold rounded-2xl shadow-lg hover:bg-[#4A5E3B] transition-all disabled:opacity-50"
              onClick={saveSteps}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-3 h-6 w-6 animate-spin" />
              ) : (
                <>
                  <Check className="mr-3 h-6 w-6" />
                  Save Steps
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
