import React, { useState } from 'react';
import { db } from '../lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { UserProfile, Gender, Goal, ActivityLevel } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { calculateBMR, calculateTDEE, calculateDailyGoal } from '../lib/calculations';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react';

interface OnboardingProps {
  user: { uid: string; displayName: string | null };
  onComplete: (profile: UserProfile) => void;
}

export default function Onboarding({ user, onComplete }: OnboardingProps) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    age: 25,
    gender: 'male' as Gender,
    height: 170, // cm
    weight: 70, // kg
    goal: 'maintain' as Goal,
    activityLevel: 'sedentary' as ActivityLevel,
  });

  const nextStep = () => setStep((s) => s + 1);
  const prevStep = () => setStep((s) => s - 1);

  const handleSubmit = async () => {
    const bmr = calculateBMR(formData.weight, formData.height, formData.age, formData.gender);
    const tdee = calculateTDEE(bmr, formData.activityLevel);
    const dailyGoal = calculateDailyGoal(tdee, formData.goal);

    const profile: UserProfile = {
      userId: user.uid,
      name: user.displayName || 'Guest',
      ...formData,
      currentWeight: formData.weight,
      tdee,
      dailyCalorieGoal: dailyGoal,
      onboardingCompleted: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(doc(db, 'users', user.uid), profile);
      onComplete(profile);
    } catch (error) {
      console.error('Failed to save profile', error);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="age">How old are you?</Label>
                <Input
                  id="age"
                  type="number"
                  value={formData.age}
                  onChange={(e) => setFormData({ ...formData, age: parseInt(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gender">Gender</Label>
                <Select
                  value={formData.gender}
                  onValueChange={(val) => setFormData({ ...formData, gender: val as Gender })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </motion.div>
        );
      case 2:
        return (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="height">Height (cm)</Label>
                <Input
                  id="height"
                  type="number"
                  value={formData.height}
                  onChange={(e) => setFormData({ ...formData, height: parseFloat(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weight">Weight (kg)</Label>
                <Input
                  id="weight"
                  type="number"
                  value={formData.weight}
                  onChange={(e) => setFormData({ ...formData, weight: parseFloat(e.target.value) })}
                />
              </div>
            </div>
          </motion.div>
        );
      case 3:
        return (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="activity">Activity Level</Label>
                <Select
                  value={formData.activityLevel}
                  onValueChange={(val) => setFormData({ ...formData, activityLevel: val as ActivityLevel })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select activity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sedentary">Sedentary (Office job)</SelectItem>
                    <SelectItem value="light">Lightly Active</SelectItem>
                    <SelectItem value="moderate">Moderately Active</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="very_active">Very Active</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="goal">Your Goal</Label>
                <Select
                  value={formData.goal}
                  onValueChange={(val) => setFormData({ ...formData, goal: val as Goal })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select goal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lose">Lose Weight</SelectItem>
                    <SelectItem value="maintain">Maintain Weight</SelectItem>
                    <SelectItem value="gain">Gain Muscle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </motion.div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F7F2] p-4 font-sans">
      <Card className="w-full max-w-md border-[#E8E6E0] bg-white shadow-sm rounded-[32px] transition-all duration-300 overflow-hidden">
        <CardHeader className="p-8">
          <div className="mb-6 flex gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                  s <= step ? 'bg-[#5A6E4B]' : 'bg-[#F1F3EE]'
                }`}
              />
            ))}
          </div>
          <CardTitle className="text-3xl font-serif font-bold text-[#2D2D2A]">Personalize your plan</CardTitle>
          <CardDescription className="text-[#8E8D8A]">We'll use this to calculate your daily goals.</CardDescription>
        </CardHeader>
        <CardContent className="px-8 py-4">{renderStep()}</CardContent>
        <CardFooter className="flex justify-between border-t border-[#E8E6E0] bg-[#F8F7F2]/50 p-8 mt-4">
          <Button
            variant="ghost"
            onClick={prevStep}
            disabled={step === 1}
            className="text-[#8E8D8A] hover:text-[#5A6E4B] rounded-xl"
          >
            {step > 1 && <ChevronLeft className="mr-2 h-4 w-4" />}
            {step > 1 ? 'Back' : ''}
          </Button>
          <Button
            onClick={step === 3 ? handleSubmit : nextStep}
            className="bg-[#5A6E4B] text-white px-8 h-12 rounded-xl hover:bg-[#4A5E3B] font-bold shadow-md"
          >
            {step === 3 ? 'Finish' : 'Next'}
            {step < 3 ? <ChevronRight className="ml-2 h-4 w-4" /> : <Check className="ml-2 h-4 w-4" />}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
