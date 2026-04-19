import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { X, Target, Loader2, Wand2 } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

import { db } from '../lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

interface GoalEditorProps {
  profile: UserProfile;
  onClose: () => void;
  onSave: (goalData: any) => void;
}

export default function GoalEditor({ profile, onClose, onSave }: GoalEditorProps) {
  const [loading, setLoading] = useState(false);
  
  // Initialize with profile defaults or whatever is in localStorage
  const [formData, setFormData] = useState({
    calories: String(profile.dailyCalorieGoal || 2000),
    weight: String(profile.weight || 70),
    height: String(profile.height || 170),
    age: String(profile.age || 30),
    gender: profile.gender || 'male',
    activityLevel: profile.activityLevel || 'moderate',
    goal: profile.goal || 'maintain'
  });

  const [aiGeneratedMacros, setAiGeneratedMacros] = useState<{protein: number, carbs: number, fats: number} | null>(null);

  useEffect(() => {
    const cached = localStorage.getItem(`user_goal_${profile.userId}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.info) setFormData({
        calories: String(parsed.info.calories || 2000),
        weight: String(parsed.info.weight || 70),
        height: String(parsed.info.height || 170),
        age: String(parsed.info.age || 30),
        gender: parsed.info.gender || 'male',
        activityLevel: parsed.info.activityLevel || 'moderate',
        goal: parsed.info.goal || 'maintain'
      });
      if (parsed.macros) setAiGeneratedMacros(parsed.macros);
    }
  }, [profile.userId]);

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setAiGeneratedMacros(null);
  };

  const handleGenerateMacros = async (dataToUse = formData) => {
    setLoading(true);
    
    // Delete the old macro values from localStorage before generating/saving the new ones
    const cached = localStorage.getItem(`user_goal_${profile.userId}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      delete parsed.macros;
      localStorage.setItem(`user_goal_${profile.userId}`, JSON.stringify(parsed));
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `The user wants to consume ${Number(dataToUse.calories) || 0} calories per day. Their goal is ${dataToUse.goal}. They are ${Number(dataToUse.age) || 0} years old, ${dataToUse.gender}, weigh ${Number(dataToUse.weight) || 0}kg, and are ${dataToUse.activityLevel}. Calculate the optimal daily macros for this person. Reply only in this exact JSON format, nothing else:\n{"protein_g": 0, "carbs_g": 0, "fat_g": 0}`;
      
      console.log('--- GEMINI PROMPT ---');
      console.log(prompt);

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });

      const text = response.text || '';
      console.log('--- GEMINI RESPONSE ---');
      console.log(text);
      
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const macros = JSON.parse(match[0]);
        const newMacros = {
          protein: macros.protein_g,
          carbs: macros.carbs_g,
          fats: macros.fat_g
        };
        setAiGeneratedMacros(newMacros);
        return newMacros;
      } else {
        throw new Error("Invalid format from Gemini");
      }
    } catch (e) {
      console.error('Gemini Error:', e);
      alert('Failed to calculate macros. Try again.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    let finalMacros = aiGeneratedMacros;
    if (!finalMacros) {
      finalMacros = await handleGenerateMacros();
      if (!finalMacros) return; // Stop save flow if gen failed and they didn't have backups
    }

    const goalData = {
      calories: Number(formData.calories) || 0,
      macros: finalMacros,
      info: {
        ...formData,
        calories: Number(formData.calories) || 0,
        weight: Number(formData.weight) || 0,
        height: Number(formData.height) || 0,
        age: Number(formData.age) || 0,
      }
    };
    
    // Update Firebase Profile
    try {
      const userRef = doc(db, 'users', profile.userId);
      await updateDoc(userRef, {
        dailyCalorieGoal: goalData.calories,
        tdee: goalData.calories,
        weight: goalData.info.weight,
        height: goalData.info.height,
        age: goalData.info.age,
        gender: goalData.info.gender,
        activityLevel: goalData.info.activityLevel,
        goal: goalData.info.goal,
        updatedAt: serverTimestamp()
      });
    } catch (firebaseError) {
      console.error('Failed to update Firestore:', firebaseError);
    }
    
    // Clean old data completely
    localStorage.removeItem(`user_goal_${profile.userId}`);
    
    localStorage.setItem(`user_goal_${profile.userId}`, JSON.stringify(goalData));
    onSave(goalData);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-[#2D2D2A]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#2D2D2A] rounded-[40px] p-8 max-w-lg w-full shadow-2xl overflow-y-auto max-h-[90vh] pb-10">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3 text-2xl font-serif font-bold text-[#2D2D2A] dark:text-[#F8F7F2]">
            <Target className="h-6 w-6 text-[#5A6E4B]" />
            <h3>My Goal</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-[#F1F3EE] dark:bg-[#3D3D3A] transition-colors">
            <X className="h-5 w-5 text-[#8E8D8A]" />
          </button>
        </div>

        <div className="space-y-6">
          <div className="p-6 rounded-3xl bg-[#F8F7F2] dark:bg-[#1a1a18] border border-[#E8E6E0] dark:border-[#3D3D3A] space-y-4">
            <Label className="text-sm font-bold uppercase tracking-wider text-[#8E8D8A]">Daily Calorie Goal</Label>
            <div className="flex items-center gap-2">
              <Input 
                type="number" 
                value={formData.calories} 
                onChange={(e) => handleChange('calories', e.target.value)}
                placeholder="2000"
                min="0"
                className="text-2xl font-bold bg-white dark:bg-[#2D2D2A] h-14 rounded-2xl w-full"
              />
              <span className="font-bold text-[#8E8D8A] whitespace-nowrap">kcal</span>
              <Button 
                onClick={() => handleGenerateMacros()}
                disabled={loading}
                variant="outline"
                className="ml-2 h-14 rounded-2xl border-[#E8E6E0] dark:border-[#3D3D3A] font-bold text-[#5A6E4B] hover:bg-[#F1F3EE] dark:bg-[#3D3D3A] flex gap-2 items-center px-4"
              >
                <Wand2 className="h-4 w-4" />
                <span className="hidden sm:inline">Recalculate</span>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Weight (kg)</Label>
              <Input 
                type="number" 
                value={formData.weight} 
                onChange={(e) => handleChange('weight', e.target.value)}
                placeholder="70"
                min="0"
                className="bg-[#F8F7F2] dark:bg-[#1a1a18] h-12 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Height (cm)</Label>
              <Input 
                type="number" 
                value={formData.height} 
                onChange={(e) => handleChange('height', e.target.value)}
                placeholder="170"
                min="0"
                className="bg-[#F8F7F2] dark:bg-[#1a1a18] h-12 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Age</Label>
              <Input 
                type="number" 
                value={formData.age} 
                onChange={(e) => handleChange('age', e.target.value)}
                placeholder="30"
                min="0"
                className="bg-[#F8F7F2] dark:bg-[#1a1a18] h-12 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Gender</Label>
              <Select value={formData.gender} onValueChange={(val) => handleChange('gender', val)}>
                <SelectTrigger className="bg-[#F8F7F2] dark:bg-[#1a1a18] border-0 h-12 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Activity Level</Label>
              <Select value={formData.activityLevel} onValueChange={(val) => handleChange('activityLevel', val)}>
                <SelectTrigger className="bg-[#F8F7F2] dark:bg-[#1a1a18] border-0 h-12 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sedentary">Sedentary</SelectItem>
                  <SelectItem value="light">Lightly Active</SelectItem>
                  <SelectItem value="moderate">Moderately Active</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="very_active">Very Active</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Main Goal</Label>
              <Select value={formData.goal} onValueChange={(val) => handleChange('goal', val)}>
                <SelectTrigger className="bg-[#F8F7F2] dark:bg-[#1a1a18] border-0 h-12 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lose">Lose Weight</SelectItem>
                  <SelectItem value="maintain">Maintain</SelectItem>
                  <SelectItem value="gain">Gain Muscle</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="p-6 rounded-3xl bg-[#5A6E4B] text-white my-6 relative overflow-hidden">
            <div className="relative z-10 space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="font-bold">AI Macro Optimizer</h4>
                <Wand2 className="h-5 w-5 text-[#DCD9D1]" />
              </div>
              <p className="text-sm text-[#DCD9D1]">
                Let Gemini calculate the perfect macronutrient split tailored to your exact body profile and goal.
              </p>
              
              {loading ? (
                <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                  <div className="bg-white dark:bg-[#2D2D2A]/10 p-3 rounded-2xl animate-pulse">
                    <p className="text-[10px] font-black uppercase text-[#E57373]">Protein</p>
                    <Loader2 className="h-4 w-4 animate-spin mx-auto mt-1" />
                  </div>
                  <div className="bg-white dark:bg-[#2D2D2A]/10 p-3 rounded-2xl animate-pulse">
                    <p className="text-[10px] font-black uppercase text-[#81C784]">Carbs</p>
                    <Loader2 className="h-4 w-4 animate-spin mx-auto mt-1" />
                  </div>
                  <div className="bg-white dark:bg-[#2D2D2A]/10 p-3 rounded-2xl animate-pulse">
                    <p className="text-[10px] font-black uppercase text-[#FFB74D]">Fats</p>
                    <Loader2 className="h-4 w-4 animate-spin mx-auto mt-1" />
                  </div>
                </div>
              ) : aiGeneratedMacros ? (
                <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                  <div className="bg-white dark:bg-[#2D2D2A]/10 p-3 rounded-2xl">
                    <p className="text-[10px] font-black uppercase text-[#E57373]">Protein</p>
                    <p className="font-bold">{aiGeneratedMacros.protein}g</p>
                  </div>
                  <div className="bg-white dark:bg-[#2D2D2A]/10 p-3 rounded-2xl">
                    <p className="text-[10px] font-black uppercase text-[#81C784]">Carbs</p>
                    <p className="font-bold">{aiGeneratedMacros.carbs}g</p>
                  </div>
                  <div className="bg-white dark:bg-[#2D2D2A]/10 p-3 rounded-2xl">
                    <p className="text-[10px] font-black uppercase text-[#FFB74D]">Fats</p>
                    <p className="font-bold">{aiGeneratedMacros.fats}g</p>
                  </div>
                </div>
              ) : (
                <Button 
                  onClick={() => handleGenerateMacros()} 
                  disabled={loading}
                  className="w-full h-12 bg-white dark:bg-[#2D2D2A] text-[#5A6E4B] hover:bg-[#F1F3EE] dark:bg-[#3D3D3A] rounded-xl font-bold mt-2"
                >
                  Calculate Macros
                </Button>
              )}
            </div>
            <div className="absolute top-0 right-0 -mr-8 -mt-8 h-32 w-32 rounded-full bg-white dark:bg-[#2D2D2A]/5" />
          </div>

          <Button 
            className="w-full h-14 bg-[#2D2D2A] hover:bg-black text-white rounded-2xl font-bold text-lg cursor-pointer"
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : "Save Goals"}
          </Button>
        </div>
      </div>
    </div>
  );
}
