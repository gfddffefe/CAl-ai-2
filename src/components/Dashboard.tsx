import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, Timestamp, limit, deleteDoc, doc } from 'firebase/firestore';
import { UserProfile, Meal, Workout, StepLog } from '../types';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Plus, Settings, History, Utensils, PieChart as PieChartIcon, Camera, Dumbbell, Footprints, TrendingUp, X, Menu, LogOut, ChevronRight, ChevronLeft, Trash2, Target, HeartPulse, Sun, Moon } from 'lucide-react';
import { format, startOfDay, addDays, subDays, isSameDay, startOfWeek, eachDayOfInterval, addWeeks, subWeeks } from 'date-fns';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import MealLogger from './MealLogger';
import WorkoutLogger from './WorkoutLogger';
import StepTracker from './StepTracker';
import GoalEditor from './GoalEditor';
import HealthSyncModal from './HealthSyncModal';
import MealDetailModal from './MealDetailModal';
import { motion, AnimatePresence, useAnimation, PanInfo } from 'motion/react';

const SwipeToDeleteItem = ({ children, onDelete, isReadOnly }: { children: React.ReactNode, onDelete: () => void, isReadOnly: boolean }) => {
  const controls = useAnimation();
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDragEnd = (e: any, info: PanInfo) => {
    if (isReadOnly) return;
    if (info.offset.x < -60) {
      controls.start({ x: -100 });
    } else {
      controls.start({ x: 0 });
      setShowConfirm(false);
    }
  };

  const handleDeleteClick = () => {
    if (!showConfirm) {
      setShowConfirm(true);
      setTimeout(() => setShowConfirm(false), 3000);
    } else {
      onDelete();
      setShowConfirm(false);
      controls.start({ x: 0 });
    }
  };

  return (
    <div className="relative rounded-[24px] overflow-hidden w-full bg-[#E57373] group">
      {!isReadOnly && (
        <div className="absolute inset-y-0 right-0 flex items-center justify-end w-[100px] text-white">
          <button 
            onClick={handleDeleteClick} 
            className="flex flex-col items-center justify-center w-full h-full gap-1"
          >
            <Trash2 className="h-5 w-5" />
            {showConfirm && <span className="text-[10px] font-bold">Sure?</span>}
          </button>
        </div>
      )}
      <motion.div
        drag={isReadOnly ? false : "x"}
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        animate={controls}
        className="relative bg-white dark:bg-[#2D2D2A] w-full rounded-[24px] z-10"
        style={{ touchAction: "pan-y" }}
      >
        <div className="flex items-center">
          <div className="flex-1 min-w-0">
             {children}
          </div>
          {!isReadOnly && (
            <div className="hidden lg:flex items-center pr-4 absolute right-0 top-0 bottom-0 pointer-events-none">
              <button 
                onClick={handleDeleteClick}
                className={`p-2 rounded-xl flex items-center gap-2 pointer-events-auto transition-colors ${showConfirm ? 'bg-[#E57373] text-white' : 'text-[#E57373] opacity-0 group-hover:opacity-100 hover:bg-red-50'}`}
              >
                <Trash2 className="h-5 w-5" />
                {showConfirm && <span className="text-xs font-bold font-sans">Sure?</span>}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

type ViewType = 'dashboard' | 'meals' | 'activities';

interface DashboardProps {
  profile: UserProfile;
  themeMode: 'light' | 'dark' | 'auto';
  onThemeChange: (mode: 'light' | 'dark' | 'auto') => void;
}

export default function Dashboard({ profile, themeMode, onThemeChange }: DashboardProps) {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [steps, setSteps] = useState<StepLog | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [activeView, setActiveView] = useState<ViewType>('dashboard');
  const [hasDataMap, setHasDataMap] = useState<Record<string, boolean>>({});
  
  const [showLogger, setShowLogger] = useState(false);
  const [showWorkoutLogger, setShowWorkoutLogger] = useState(false);
  const [showStepTracker, setShowStepTracker] = useState(false);
  const [showGoalEditor, setShowGoalEditor] = useState(false);
  const [showHealthSync, setShowHealthSync] = useState(false);
  
  const [stepsFromHealth, setStepsFromHealth] = useState(0);
  const [caloriesFromHealth, setCaloriesFromHealth] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [isHealthSynced, setIsHealthSynced] = useState(false);

  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [confirmClearSteps, setConfirmClearSteps] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [userGoal, setUserGoal] = useState(() => {
    const cached = localStorage.getItem(`user_goal_${profile.userId}`);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.calories) {
          return {
            calories: Number(parsed.calories),
            macros: parsed.macros || {
              protein: Math.round((Number(parsed.calories) * 0.3) / 4),
              carbs: Math.round((Number(parsed.calories) * 0.4) / 4),
              fats: Math.round((Number(parsed.calories) * 0.3) / 9)
            },
            info: parsed.info || { ...profile }
          };
        }
      } catch (e) {}
    }
    
    const fallbackCals = profile.dailyCalorieGoal || 2000;
    return {
      calories: fallbackCals,
      macros: {
        protein: Math.round((fallbackCals * 0.3) / 4),
        carbs: Math.round((fallbackCals * 0.4) / 4),
        fats: Math.round((fallbackCals * 0.3) / 9)
      },
      info: { ...profile }
    };
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLButtonElement>(null);

  const ensureDate = (ts: any): Date => {
    if (!ts) return new Date();
    if (ts instanceof Date) return ts;
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    if (typeof ts === 'string' || typeof ts === 'number') return new Date(ts);
    return new Date();
  };

  useEffect(() => {
    if (todayRef.current) {
      todayRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, []);

  // Sync currentWeekStart with selectedDate
  useEffect(() => {
    const startObj = startOfWeek(selectedDate, { weekStartsOn: 1 });
    if (!isSameDay(startObj, currentWeekStart)) {
      setCurrentWeekStart(startObj);
    }
  }, [selectedDate, currentWeekStart]);

  // Generate week days dynamically
  const weekDays = eachDayOfInterval({
    start: currentWeekStart,
    end: addDays(currentWeekStart, 6),
  });

  const fetchData = async (targetDate: Date) => {
    const dayStart = startOfDay(targetDate);
    const dayEnd = addDays(dayStart, 1);
    const dayTS = Timestamp.fromDate(dayStart);
    const nextDayTS = Timestamp.fromDate(dayEnd);

    // Filter by date range
    const mealsQ = query(
      collection(db, 'users', profile.userId, 'meals'),
      where('timestamp', '>=', dayTS),
      where('timestamp', '<', nextDayTS),
      orderBy('timestamp', 'desc')
    );

    const workoutsQ = query(
      collection(db, 'users', profile.userId, 'workouts'),
      where('timestamp', '>=', dayTS),
      where('timestamp', '<', nextDayTS),
      orderBy('timestamp', 'desc')
    );

    const stepsQ = query(
      collection(db, 'users', profile.userId, 'steps'),
      where('timestamp', '>=', dayTS),
      where('timestamp', '<', nextDayTS),
      orderBy('timestamp', 'desc'),
      limit(1)
    );

    try {
      const [mealsSnap, workoutsSnap, stepsSnap] = await Promise.all([
        getDocs(mealsQ),
        getDocs(workoutsQ),
        getDocs(stepsQ)
      ]);

      const fetchedMeals = mealsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Meal[];
      const fetchedWorkouts = workoutsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Workout[];
      const fetchedSteps = stepsSnap.empty ? null : { id: stepsSnap.docs[0].id, ...stepsSnap.docs[0].data() } as StepLog;

      setMeals(fetchedMeals);
      setWorkouts(fetchedWorkouts);
      setSteps(fetchedSteps);

      // Save to localStorage as requested
      const dateKey = format(dayStart, 'yyyy-MM-dd');
      const dailyData = {
        meals: fetchedMeals,
        workouts: fetchedWorkouts,
        steps: fetchedSteps,
        summary: {
          calories: fetchedMeals.reduce((s, m) => s + m.calories, 0),
          burned: fetchedWorkouts.reduce((s, w) => s + w.caloriesBurned, 0) + (fetchedSteps?.caloriesBurned || 0)
        }
      };
      localStorage.setItem(`data_${dateKey}`, JSON.stringify(dailyData));
      
      // Update data map for dots
      setHasDataMap(prev => ({ ...prev, [dateKey]: fetchedMeals.length > 0 || fetchedWorkouts.length > 0 || !!fetchedSteps }));

    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const isPastDay = !isSameDay(selectedDate, new Date()) && selectedDate < new Date();

  useEffect(() => {
    // Try loading from localStorage first for faster UI
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    const cached = localStorage.getItem(`data_${dateKey}`);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setMeals(parsed.meals || []);
        setWorkouts(parsed.workouts || []);
        setSteps(parsed.steps || null);
      } catch (e) {
        console.error('Failed to parse cached data', e);
      }
    }
    fetchData(selectedDate);
  }, [profile.userId, selectedDate]);

  // Listen to health_sync dynamically
  useEffect(() => {
    // Reset to 0 when switching days before new data loads
    setStepsFromHealth(0);
    setCaloriesFromHealth(0);
    setIsHealthSynced(false);
    setLastSyncTime(null);

    let unsubscribe = () => {};
    
    import('firebase/firestore').then(({ onSnapshot, doc }) => {
      const dateKey = format(selectedDate, 'yyyy-MM-dd');
      const syncRef = doc(db, 'users', profile.userId, 'health_sync', dateKey);
      
      unsubscribe = onSnapshot(syncRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setStepsFromHealth(data.steps || 0);
          setCaloriesFromHealth(data.activeCalories || 0);
          setIsHealthSynced(true);
          setLastSyncTime(data.syncedAt || null);
        } else {
          // No health data for this day — reset to 0
          setStepsFromHealth(0);
          setCaloriesFromHealth(0);
          setIsHealthSynced(false);
          setLastSyncTime(null);
        }
      });
    });

    return () => unsubscribe();
  }, [profile.userId, selectedDate]);

  const mealStats = meals.reduce(
    (acc, meal) => ({
      calories: acc.calories + meal.calories,
      protein: acc.protein + meal.protein,
      carbs: acc.carbs + meal.carbs,
      fats: acc.fats + meal.fats,
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  );

  const manualWorkoutBurn = workouts.reduce((sum, w) => sum + w.caloriesBurned, 0);
  const manualStepsBurn = steps?.caloriesBurned || 0;
  const manualStepsCount = steps?.count || 0;
  
  const displayStepsCount = isHealthSynced && stepsFromHealth > manualStepsCount ? stepsFromHealth : manualStepsCount;
  // If health is synced, its algorithms automatically aggregate workouts inside `activeCalories` directly
  // unless user prefers additive. Typically Apple Health `activeEnergyBurned` is the exhaustive truth.
  // We'll follow instructions: "Use caloriesFromHealth in the calories burned calculation alongside workout calories"
  // Actually, instructions state: "Use caloriesFromHealth in the calories burned calculation alongside workout calories"
  // Wait, if it's alongside, it's caloriesFromHealth + manualWorkoutBurn? 
  // Apple Health's activeCalories includes workouts usually.
  // The instructions: "Use caloriesFromHealth in the calories burned calculation alongside workout calories"
  // "Synced steps and activeCalories added to burned calories total"
  const totalBurned = isHealthSynced 
    ? (caloriesFromHealth + manualWorkoutBurn) 
    : (manualWorkoutBurn + manualStepsBurn);

  const netCalories = mealStats.calories - totalBurned;
  const isOverGoal = netCalories > userGoal.calories;
  const remainingCals = userGoal.calories - netCalories;
  
  const progressValue = Math.min((Math.max(netCalories, 0) / userGoal.calories) * 100, 100);

  const deleteMeal = async (mealId: string) => {
    try {
      await deleteDoc(doc(db, 'users', profile.userId, 'meals', mealId));
      const newMeals = meals.filter(m => m.id !== mealId);
      setMeals(newMeals);
      const dateKey = format(selectedDate, 'yyyy-MM-dd');
      const cached = localStorage.getItem(`data_${dateKey}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        parsed.meals = newMeals;
        parsed.summary.calories = newMeals.reduce((s: number, m: Meal) => s + m.calories, 0);
        localStorage.setItem(`data_${dateKey}`, JSON.stringify(parsed));
      }
    } catch (e) {
      console.error('Error deleting meal:', e);
    }
  };

  const deleteWorkout = async (workoutId: string) => {
    try {
      await deleteDoc(doc(db, 'users', profile.userId, 'workouts', workoutId));
      const newWorkouts = workouts.filter(w => w.id !== workoutId);
      setWorkouts(newWorkouts);
      const dateKey = format(selectedDate, 'yyyy-MM-dd');
      const cached = localStorage.getItem(`data_${dateKey}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        parsed.workouts = newWorkouts;
        const newBurn = newWorkouts.reduce((s: number, w: Workout) => s + w.caloriesBurned, 0) + (steps?.caloriesBurned || 0);
        parsed.summary.burned = newBurn;
        localStorage.setItem(`data_${dateKey}`, JSON.stringify(parsed));
      }
    } catch (e) {
      console.error('Error deleting workout:', e);
    }
  };

  const clearSteps = async () => {
    if (!steps || isPastDay) return;

    try {
      if (steps.id) {
        await deleteDoc(doc(db, 'users', profile.userId, 'steps', steps.id));
      }
      setSteps(null);
      const dateKey = format(selectedDate, 'yyyy-MM-dd');
      const cached = localStorage.getItem(`data_${dateKey}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        parsed.steps = null;
        parsed.summary.burned = workouts.reduce((sum, w) => sum + w.caloriesBurned, 0);
        localStorage.setItem(`data_${dateKey}`, JSON.stringify(parsed));
      }
    } catch (e) {
      console.error('Error clearing steps:', e);
    }
  };

  const cycleTheme = () => {
    if (themeMode === 'light') onThemeChange('dark');
    else if (themeMode === 'dark') onThemeChange('auto');
    else onThemeChange('light');
  };

  const renderThemeIcon = () => {
    if (themeMode === 'light') return <Sun className="h-5 w-5" />;
    if (themeMode === 'dark') return <Moon className="h-5 w-5" />;
    return <div className="text-[10px] font-bold">AUTO</div>;
  };

  return (
    <div className="flex min-h-screen bg-[#F8F7F2] dark:bg-[#1a1a18] font-sans text-[#2D2D2A] dark:text-[#F8F7F2] overflow-x-hidden transition-colors">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex w-72 flex-col border-r border-[#E8E6E0] dark:border-[#3D3D3A] bg-white dark:bg-[#2D2D2A] p-8 sticky top-0 h-screen transition-colors">
        <div className="flex items-center gap-2 text-2xl font-serif font-bold text-[#5A6E4B] mb-12">
          <Utensils className="h-6 w-6" />
          <span>Cal AI</span>
        </div>
        <nav className="flex-1 space-y-2">
          <div 
            onClick={() => { setActiveView('dashboard'); setIsMobileMenuOpen(false); }}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 font-semibold transition-colors cursor-pointer ${
              activeView === 'dashboard' ? 'bg-[#F8F7F2] dark:bg-[#1a1a18] text-[#5A6E4B]' : 'text-[#8E8D8A] hover:bg-[#F8F7F2] dark:hover:bg-[#1a1a18]'
            }`}
          >
            <TrendingUp className="h-5 w-5" />
            Dashboard
          </div>
          <div 
            onClick={() => { setActiveView('meals'); setIsMobileMenuOpen(false); }}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 font-medium transition-colors cursor-pointer ${
              activeView === 'meals' ? 'bg-[#F8F7F2] dark:bg-[#1a1a18] text-[#5A6E4B]' : 'text-[#8E8D8A] hover:bg-[#F8F7F2] dark:hover:bg-[#1a1a18]'
            }`}
          >
            <Utensils className="h-5 w-5" />
            My Meals
          </div>
          <div 
            onClick={() => { setActiveView('activities'); setIsMobileMenuOpen(false); }}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 font-medium transition-colors cursor-pointer ${
              activeView === 'activities' ? 'bg-[#F8F7F2] dark:bg-[#1a1a18] text-[#5A6E4B]' : 'text-[#8E8D8A] hover:bg-[#F8F7F2] dark:hover:bg-[#1a1a18]'
            }`}
          >
            <Dumbbell className="h-5 w-5" />
            Activities
          </div>
        </nav>
        <div className="mt-auto pt-8 border-t border-[#E8E6E0] dark:border-[#3D3D3A]">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-full bg-[#DCD9D1] dark:bg-[#3D3D3A]" />
            <div className="min-w-0">
              <p className="font-bold text-sm truncate">{profile.name}</p>
              <p className="text-xs text-[#8E8D8A]">Premium Account</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-3 rounded-xl px-4 py-3 font-medium text-[#8E8D8A] hover:bg-[#F8F7F2] dark:hover:bg-[#1a1a18] hover:text-[#5A6E4B] mb-2"
            onClick={cycleTheme}
          >
            {renderThemeIcon()}
            Theme: {themeMode.charAt(0).toUpperCase() + themeMode.slice(1)}
          </Button>
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-3 rounded-xl px-4 py-3 font-medium text-[#8E8D8A] hover:bg-[#F8F7F2] dark:hover:bg-[#1a1a18] hover:text-[#5A6E4B] mb-2"
            onClick={() => setShowGoalEditor(true)}
          >
            <Target className="h-5 w-5" />
            My Goal
          </Button>
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-3 rounded-xl px-4 py-3 font-medium text-[#8E8D8A] hover:bg-[#F8F7F2] dark:hover:bg-[#1a1a18] hover:text-[#5A6E4B] mb-2"
            onClick={() => setShowHealthSync(true)}
          >
            <HeartPulse className="h-5 w-5" />
            Sync Apple Health
          </Button>
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-3 rounded-xl px-4 py-3 font-medium text-[#8E8D8A] hover:text-[#E57373] hover:bg-red-50 dark:hover:bg-[#E57373]/10"
            onClick={() => auth.signOut()}
          >
            <LogOut className="h-5 w-5" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full pb-32 lg:pb-10">
        {/* Desktop Header for Theme (when sidebar not enough, but putting it in sidebar is fine. Let's add it to mobile header) */}
        
        {/* Mobile Header */}
        <header className="lg:hidden flex flex-col items-stretch bg-white dark:bg-[#2D2D2A] border-b border-[#E8E6E0] dark:border-[#3D3D3A] sticky top-0 z-40 transition-colors">
          <div className="flex items-center justify-between p-6">
            <div className="flex items-center gap-2 text-xl font-serif font-bold text-[#5A6E4B]">
              <Utensils className="h-5 w-5" />
              <span>Cal AI</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={cycleTheme} className="text-[#8E8D8A]">
                {renderThemeIcon()}
              </Button>
              <Button variant="ghost" size="icon" className="text-[#8E8D8A]" onClick={() => setIsMobileMenuOpen(true)}>
                <Menu className="h-6 w-6" />
              </Button>
            </div>
          </div>
          
          {/* Day Selector - Mobile */}
          <div className="flex items-center px-1 pb-4">
            <Button variant="ghost" size="icon" onClick={() => setSelectedDate(subWeeks(selectedDate, 1))} className="text-[#8E8D8A] shrink-0">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div ref={scrollRef} className="flex overflow-x-auto no-scrollbar gap-2 scroll-smooth flex-1">
              {weekDays.map((day) => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const isSelected = isSameDay(day, selectedDate);
                const isToday = isSameDay(day, new Date());
                return (
                  <button
                    key={day.toString()}
                    ref={isToday ? todayRef : null}
                    onClick={() => setSelectedDate(day)}
                    className={`flex flex-col items-center justify-center min-w-[50px] shrink-0 h-16 rounded-2xl transition-all ${
                      isSelected 
                        ? 'bg-[#5A6E4B] text-white shadow-lg' 
                        : isToday
                          ? 'bg-[#F8F7F2] dark:bg-[#1a1a18] text-[#5A6E4B] border border-[#5A6E4B] shadow-sm'
                          : 'bg-[#F8F7F2] dark:bg-[#1a1a18] text-[#8E8D8A] border border-transparent hover:bg-[#F1F3EE] dark:hover:bg-[#3D3D3A]'
                    }`}
                  >
                    <span className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isSelected ? 'text-white/70' : ''}`}>
                      {format(day, 'EEE')}
                    </span>
                    <span className="text-lg font-black">{format(day, 'd')}</span>
                    {hasDataMap[dateKey] && (
                      <div className={`h-1 w-1 rounded-full mt-1 ${isSelected ? 'bg-white dark:bg-[#2D2D2A]' : 'bg-[#5A6E4B]'}`} />
                    )}
                  </button>
                );
              })}
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelectedDate(addWeeks(selectedDate, 1))} className="text-[#8E8D8A] shrink-0">
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </header>

        <div className="p-6 lg:p-10 grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-8">
          {activeView === 'dashboard' ? (
            <>
              {/* Welcome Text & Desktop Day Selector */}
              <div className="col-span-1 xl:col-span-2 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                  <h1 className="text-3xl lg:text-4xl font-serif font-bold text-[#2D2D2A] dark:text-[#F8F7F2]">
                    Hi, {profile.name.split(' ')[0]}
                  </h1>
                  <p className="text-[#8E8D8A] mt-1 lg:text-lg">
                    {format(selectedDate, 'EEEE, MMM d')} • <span className="text-[#5A6E4B] font-medium">{profile.currentWeight || profile.weight} kg</span>
                  </p>
                </div>

                <div className="hidden lg:flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setSelectedDate(subWeeks(selectedDate, 1))} className="text-[#8E8D8A] shrink-0 bg-white dark:bg-[#2D2D2A] border border-[#E8E6E0] dark:border-[#3D3D3A] rounded-full hover:bg-[#F8F7F2] dark:hover:bg-[#1a1a18]">
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar pt-1">
                    {weekDays.map((day) => {
                      const isSelected = isSameDay(day, selectedDate);
                      const isToday = isSameDay(day, new Date());
                      const dateKey = format(day, 'yyyy-MM-dd');
                      return (
                        <button
                          key={day.toString()}
                          onClick={() => setSelectedDate(day)}
                          className={`flex flex-col items-center justify-center min-w-[70px] shrink-0 h-20 rounded-[24px] transition-all ${
                            isSelected 
                              ? 'bg-[#5A6E4B] text-white shadow-lg' 
                              : isToday
                                ? 'bg-white dark:bg-[#2D2D2A] border border-[#5A6E4B] text-[#5A6E4B] hover:bg-[#F8F7F2] dark:hover:bg-[#1a1a18] shadow-sm'
                                : 'bg-white dark:bg-[#2D2D2A] border border-[#E8E6E0] dark:border-[#3D3D3A] text-[#8E8D8A] hover:bg-[#F8F7F2] dark:hover:bg-[#1a1a18]'
                          }`}
                        >
                          <span className="text-[10px] font-bold uppercase tracking-widest mb-1">{format(day, 'EEE')}</span>
                          <span className="text-xl font-black">{format(day, 'd')}</span>
                          {hasDataMap[dateKey] && (
                            <div className={`h-1.5 w-1.5 rounded-full mt-1 ${isSelected ? 'bg-white dark:bg-[#2D2D2A]' : 'bg-[#5A6E4B]'}`} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedDate(addWeeks(selectedDate, 1))} className="text-[#8E8D8A] shrink-0 bg-white dark:bg-[#2D2D2A] border border-[#E8E6E0] dark:border-[#3D3D3A] rounded-full hover:bg-[#F8F7F2] dark:hover:bg-[#1a1a18]">
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              {/* Left Column */}
              <div className="space-y-8">
                {/* Main Stats Card */}
                <Card className="rounded-[40px] border-[#E8E6E0] dark:border-[#3D3D3A] bg-white dark:bg-[#2D2D2A] p-8 lg:p-12 shadow-sm relative overflow-hidden">
                  <div className="flex flex-col lg:flex-row items-center gap-10">
                    <div className="relative flex h-60 w-60 lg:h-72 lg:w-72 items-center justify-center">
                      <svg className="absolute inset-0 h-full w-full -rotate-90">
                        <circle
                          cx="50%" cy="50%" r="45%"
                          fill="none"
                          stroke="#F1F3EE"
                          strokeWidth="16"
                        />
                        <circle
                          cx="50%" cy="50%" r="45%"
                          fill="none"
                          stroke={isOverGoal ? "#E57373" : "#5A6E4B"}
                          strokeWidth="16"
                          strokeDasharray={`${progressValue * 2.83 * (progressValue > 100 ? 1 : 1)} 2000`}
                          strokeLinecap="round"
                          className="transition-all duration-1000 ease-out"
                        />
                      </svg>
                      <div className="text-center z-10 flex flex-col items-center">
                        <p className={`text-6xl font-bold ${isOverGoal ? 'text-[#E57373]' : 'text-[#2D2D2A] dark:text-[#F8F7F2]'}`}>
                          {Math.max(0, remainingCals).toLocaleString()}
                        </p>
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#8E8D8A] mt-1 mb-2">Kcal Left</p>
                        <p className="text-[10px] font-bold text-[#8E8D8A] bg-[#F1F3EE] dark:bg-[#3D3D3A] px-3 py-1 rounded-full uppercase tracking-wider">{netCalories} / {userGoal.calories} kcal</p>
                      </div>
                    </div>

                    <div className="flex-1 w-full grid grid-cols-2 gap-3 lg:gap-4">
                      <div className="p-4 lg:p-6 rounded-[32px] bg-[#F1F3EE] dark:bg-[#3D3D3A] border border-[#E8E6E0] dark:border-[#3D3D3A]/50 flex flex-col justify-between">
                        <p className="text-[10px] font-black uppercase tracking-widest text-[#8E8D8A] mb-1">Eaten</p>
                        <p className="text-2xl font-bold text-[#2D2D2A] dark:text-[#F8F7F2]">{mealStats.calories}</p>
                      </div>
                      <div className="p-4 lg:p-6 rounded-[32px] bg-[#F1F3EE] dark:bg-[#3D3D3A] border border-[#E8E6E0] dark:border-[#3D3D3A]/50 relative overflow-hidden flex flex-col justify-between">
                        <div className="flex flex-wrap xl:flex-nowrap justify-between items-start gap-1.5 mb-1">
                          <p className="text-[10px] font-black uppercase tracking-widest text-[#8E8D8A] mt-0.5">Burned</p>
                          {isHealthSynced && (
                            <span className="text-[8px] font-bold uppercase text-[#5A6E4B] bg-[#5A6E4B]/10 px-2 py-0.5 rounded-full flex items-center shrink-0 whitespace-nowrap">
                              Apple Health
                            </span>
                          )}
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-[#5A6E4B]">{totalBurned}</p>
                          {isHealthSynced && lastSyncTime && (
                            <p className="text-[9px] text-[#8E8D8A] mt-1 font-medium leading-tight">Last synced:<br/>{format(new Date(lastSyncTime), 'h:mm a')}</p>
                          )}
                        </div>
                      </div>
                      <div className="col-span-2 p-8 lg:p-10 rounded-[40px] bg-[#2D2D2A] text-white overflow-hidden shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                          <p className="text-xs font-black uppercase tracking-[0.2em] opacity-60">Daily Macros</p>
                          <button onClick={() => setShowGoalEditor(true)} className="text-[10px] font-bold uppercase tracking-wider bg-[#3D3D3A] dark:bg-white/10 text-[#F8F7F2] dark:text-[#F8F7F2] px-3 py-1.5 rounded-full hover:bg-[#4D4D4A] dark:hover:bg-white/20 transition-colors cursor-pointer flex items-center gap-1">
                            <Target className="h-3 w-3" /> Edit Goal
                          </button>
                        </div>
                        <div className="space-y-6">
                          {/* Protein */}
                          <div className="space-y-2">
                            <div className="flex justify-between text-[11px] font-black uppercase tracking-widest">
                              <span className="text-[#E57373]">Protein</span>
                              <span>{mealStats.protein}g / {userGoal.macros.protein}g</span>
                            </div>
                            <div className="h-3 w-full rounded-full bg-white dark:bg-[#2D2D2A]/10 overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min((mealStats.protein / userGoal.macros.protein) * 100, 100)}%` }}
                                className="h-full bg-[#E57373]" 
                              />
                            </div>
                          </div>
                          {/* Carbs */}
                          <div className="space-y-2">
                            <div className="flex justify-between text-[11px] font-black uppercase tracking-widest">
                              <span className="text-[#81C784]">Carbs</span>
                              <span>{mealStats.carbs}g / {userGoal.macros.carbs}g</span>
                            </div>
                            <div className="h-3 w-full rounded-full bg-white dark:bg-[#2D2D2A]/10 overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min((mealStats.carbs / userGoal.macros.carbs) * 100, 100)}%` }}
                                className="h-full bg-[#81C784]" 
                              />
                            </div>
                          </div>
                          {/* Fats */}
                          <div className="space-y-2">
                            <div className="flex justify-between text-[11px] font-black uppercase tracking-widest">
                              <span className="text-[#FFB74D]">Fats</span>
                              <span>{mealStats.fats}g / {userGoal.macros.fats}g</span>
                            </div>
                            <div className="h-3 w-full rounded-full bg-white dark:bg-[#2D2D2A]/10 overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min((mealStats.fats / userGoal.macros.fats) * 100, 100)}%` }}
                                className="h-full bg-[#FFB74D]" 
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {!isPastDay && (
                    <div className="mt-10 grid grid-cols-2 lg:grid-cols-3 gap-4">
                      <Button 
                        className="h-14 rounded-2xl bg-[#5A6E4B] hover:bg-[#4A5E3B] text-white font-bold flex gap-3 shadow-lg lg:col-span-2"
                        onClick={() => setShowLogger(true)}
                      >
                        <Camera className="h-5 w-5" />
                        <span className="hidden sm:inline">Identify Food</span>
                        <span className="sm:hidden">Scan</span>
                      </Button>
                      <Button 
                        variant="outline"
                        className="h-14 rounded-2xl border-[#E8E6E0] dark:border-[#3D3D3A] font-bold flex gap-3 hover:bg-[#F1F3EE] dark:bg-[#3D3D3A]"
                        onClick={() => setShowWorkoutLogger(true)}
                      >
                        <Dumbbell className="h-5 w-5 text-[#5A6E4B]" />
                        Log Sport
                      </Button>
                    </div>
                  )}
                </Card>

                {/* Burn Breakdown Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card 
                    className={`rounded-[32px] border-[#E8E6E0] dark:border-[#3D3D3A] bg-white dark:bg-[#2D2D2A] p-6 shadow-sm flex items-center gap-4 transition-colors ${!isPastDay && !isHealthSynced ? 'cursor-pointer hover:border-[#5A6E4B]' : (isHealthSynced ? 'border-[#5A6E4B] ring-1 ring-[#5A6E4B]/20' : 'opacity-80')}`}
                    onClick={() => !isPastDay && !isHealthSynced && setShowStepTracker(true)}
                  >
                    <div className={`h-14 w-14 rounded-2xl flex items-center justify-center ${isHealthSynced ? 'bg-[#5A6E4B] text-white' : 'bg-[#F1F3EE] dark:bg-[#3D3D3A] text-[#5A6E4B]'}`}>
                      {isHealthSynced ? <HeartPulse className="h-7 w-7" /> : <Footprints className="h-7 w-7" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-black uppercase tracking-widest text-[#8E8D8A]">{isHealthSynced ? 'Health Steps' : 'Steps'}</p>
                      <p className="text-2xl font-bold">{displayStepsCount.toLocaleString()} <span className="text-sm font-normal opacity-50">steps</span></p>
                    </div>
                    <div className="text-right flex items-center justify-end gap-2">
                      <div className="text-right">
                        {isHealthSynced ? (
                             <p className="text-xs font-medium text-[#8E8D8A]">Sync Active</p>
                        ) : (
                          <>
                            <p className="text-sm font-bold text-[#5A6E4B]">+{manualStepsBurn.toFixed(1)}</p>
                            <p className="text-[10px] text-[#8E8D8A]">kcal burned</p>
                          </>
                        )}
                      </div>
                      {steps && !isPastDay && !isHealthSynced && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!confirmClearSteps) {
                              setConfirmClearSteps(true);
                              setTimeout(() => setConfirmClearSteps(false), 3000);
                            } else {
                              clearSteps();
                              setConfirmClearSteps(false);
                            }
                          }}
                          className={`p-2 rounded-xl transition-colors flex items-center gap-1 ${confirmClearSteps ? 'bg-[#E57373] text-white' : 'text-[#E57373] hover:bg-red-50'}`}
                        >
                          <Trash2 className="h-4 w-4" />
                          {confirmClearSteps && <span className="text-[10px] font-bold">Sure?</span>}
                        </button>
                      )}
                    </div>
                  </Card>

                  <Card className="rounded-[32px] border-[#E8E6E0] dark:border-[#3D3D3A] bg-white dark:bg-[#2D2D2A] p-6 shadow-sm flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-[#F1F3EE] dark:bg-[#3D3D3A] flex items-center justify-center">
                      <History className="h-7 w-7 text-[#5A6E4B]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-black uppercase tracking-widest text-[#8E8D8A]">Workouts</p>
                      <p className="text-2xl font-bold">{workouts.length} <span className="text-sm font-normal opacity-50">sessions</span></p>
                    </div>
                    <div className="text-right">
                      {isHealthSynced ? (
                        <p className="text-xs font-medium text-[#8E8D8A]">Sync Active</p>
                      ) : (
                        <>
                          <p className="text-sm font-bold text-[#5A6E4B]">+{manualWorkoutBurn}</p>
                          <p className="text-[10px] text-[#8E8D8A]">kcal burned</p>
                        </>
                      )}
                    </div>
                  </Card>
                </div>
              </div>

              {/* Right Column / Sidebar Sections */}
              <div className="space-y-8">
                {/* Workout History Selected Date */}
                {workouts.length > 0 && (
                  <Card className="rounded-[32px] border-[#E8E6E0] dark:border-[#3D3D3A] bg-white dark:bg-[#2D2D2A] p-8 shadow-sm">
                    <h3 className="text-xl font-bold mb-6 flex items-center justify-between">
                      Workout History
                      <Dumbbell className="h-5 w-5 text-[#8E8D8A]" />
                    </h3>
                    <div className="space-y-4">
                      {workouts.map((w) => (
                        <div key={w.id}>
                          <SwipeToDeleteItem isReadOnly={isPastDay} onDelete={() => deleteWorkout(w.id)}>
                            <div className="flex items-center gap-4 p-4 rounded-2xl bg-[#F8F7F2] dark:bg-[#1a1a18] border border-[#E8E6E0] dark:border-[#3D3D3A]/50">
                              <div className="h-10 w-10 rounded-xl bg-white dark:bg-[#2D2D2A] flex items-center justify-center shrink-0">
                                <Dumbbell className="h-5 w-5 text-[#5A6E4B]" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm truncate">{w.type}</p>
                                <p className="text-[10px] text-[#8E8D8A] uppercase font-bold">{w.duration} min • {w.intensity}</p>
                              </div>
                              <p className="font-bold text-[#5A6E4B] shrink-0">-{w.caloriesBurned}</p>
                            </div>
                          </SwipeToDeleteItem>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Meal History */}
                <Card className="rounded-[32px] border-[#E8E6E0] dark:border-[#3D3D3A] bg-white dark:bg-[#2D2D2A] p-8 shadow-sm">
                  <h3 className="text-xl font-bold mb-6 flex items-center justify-between">
                    Food Log
                    <Utensils className="h-5 w-5 text-[#8E8D8A]" />
                  </h3>
                  <div className="space-y-6">
                    {meals.length === 0 ? (
                      <div className="text-center py-10 opacity-50">
                        <Utensils className="h-10 w-10 mx-auto mb-2 text-[#DCD9D1]" />
                        <p className="text-sm">No meals logged for this day</p>
                      </div>
                    ) : (
                      meals.map((meal) => {
                        console.log(`Meal rendering - [${meal.name}] image check:`, meal.imageUrl ? meal.imageUrl.substring(0, 50) + '...' : 'undefined');
                        return (
                        <div key={meal.id}>
                          <SwipeToDeleteItem isReadOnly={isPastDay} onDelete={() => deleteMeal(meal.id)}>
                            <div className="flex items-center gap-4 group cursor-pointer bg-white dark:bg-[#2D2D2A]" onClick={() => setSelectedMeal(meal)}>
                               <div className="h-[60px] w-[60px] rounded-2xl bg-[#F1F3EE] dark:bg-[#3D3D3A] flex items-center justify-center shrink-0 overflow-hidden relative border border-[#E8E6E0] dark:border-[#3D3D3A]/50">
                                {meal.imageUrl ? (
                                  <img src={meal.imageUrl} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <Utensils className="h-6 w-6 text-[#8E8D8A]" />
                                )}
                                <span className="absolute bottom-0 right-0 text-[8px] bg-[#5A6E4B] text-white px-1 leading-tight font-black">AI</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm truncate group-hover:text-[#5A6E4B] transition-colors">{meal.name}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <p className="text-xs text-[#8E8D8A]">{format(ensureDate(meal.timestamp), 'h:mm a')}</p>
                                  {meal.servings && meal.servings > 1 && (
                                    <span className="text-[10px] bg-[#E8E6E0] text-[#8E8D8A] px-1.5 py-0.5 rounded-md font-bold">{meal.servings} servings</span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right shrink-0 pr-2 lg:pr-14">
                                <p className="font-bold text-sm">{meal.calories} kcal</p>
                                <div className="flex gap-1 mt-1 justify-end">
                                  <div className="h-1 w-3 rounded-full bg-[#E57373]" />
                                  <div className="h-1 w-3 rounded-full bg-[#81C784]" />
                                  <div className="h-1 w-3 rounded-full bg-[#FFB74D]" />
                                </div>
                              </div>
                            </div>
                          </SwipeToDeleteItem>
                        </div>
                        );
                      })
                    )}
                  </div>
                </Card>

                {/* AI Insight */}
                <div className="rounded-[32px] bg-[#2D2D2A] p-8 text-white relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                    <PieChartIcon className="h-24 w-24" />
                  </div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] opacity-50 mb-4">Gemini Insights</p>
                  <p className="text-sm leading-relaxed font-serif italic text-white/90">
                    {isSameDay(selectedDate, new Date()) 
                      ? `"Based on today's activity, you've burned ${totalBurned} kcal. Try hitting 10k steps to reach your 'Active' goal for the week."`
                      : `"On this day, you were ${mealStats.calories > profile.dailyCalorieGoal ? 'above' : 'within'} your limit. Consistency is the key to longevity."`
                    }
                  </p>
                </div>
              </div>
            </>
          ) : activeView === 'meals' ? (
            <div className="col-span-1 xl:col-span-2 space-y-8">
              <h2 className="text-3xl font-serif font-bold">Meal History</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {/* Meals history content would go here, for now using a placeholder filter or message */}
                 <p className="text-[#8E8D8A]">Viewing all logged meals in chronological order...</p>
                 {meals.map(m => (
                   <div key={m.id}>
                     <SwipeToDeleteItem isReadOnly={isPastDay} onDelete={() => deleteMeal(m.id)}>
                       <Card className="p-4 rounded-2xl flex gap-4 items-center cursor-pointer hover:border-[#5A6E4B] transition-colors" onClick={() => setSelectedMeal(m)}>
                         <div className="h-12 w-12 rounded-xl bg-[#F1F3EE] dark:bg-[#3D3D3A] flex items-center justify-center">
                           <Utensils className="h-5 w-5 text-[#5A6E4B]" />
                         </div>
                         <div>
                           <p className="font-bold">{m.name}</p>
                           <div className="flex items-center gap-2 mt-0.5">
                             <p className="text-xs text-[#8E8D8A]">{format(ensureDate(m.timestamp), 'MMM d, h:mm a')}</p>
                             {m.servings && m.servings > 1 && (
                               <span className="text-[10px] bg-[#E8E6E0] text-[#8E8D8A] px-1.5 py-0.5 rounded-md font-bold">{m.servings} servings</span>
                             )}
                           </div>
                         </div>
                         <div className="ml-auto font-bold">{m.calories} cal</div>
                       </Card>
                     </SwipeToDeleteItem>
                   </div>
                 ))}
              </div>
            </div>
          ) : (
            <div className="col-span-1 xl:col-span-2 space-y-8">
              <h2 className="text-3xl font-serif font-bold">Activity History</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 <p className="text-[#8E8D8A]">Viewing your workout sessions and activity milestones...</p>
                 {workouts.map(w => (
                   <div key={w.id}>
                     <SwipeToDeleteItem isReadOnly={isPastDay} onDelete={() => deleteWorkout(w.id)}>
                       <Card className="p-4 rounded-2xl flex gap-4 items-center">
                         <div className="h-12 w-12 rounded-xl bg-[#F1F3EE] dark:bg-[#3D3D3A] flex items-center justify-center">
                           <Dumbbell className="h-5 w-5 text-[#5A6E4B]" />
                         </div>
                         <div>
                           <p className="font-bold">{w.type}</p>
                           <p className="text-xs text-[#8E8D8A]">{format(ensureDate(w.timestamp), 'MMM d, h:mm a')}</p>
                         </div>
                         <div className="ml-auto font-bold text-[#5A6E4B]">-{w.caloriesBurned} cal</div>
                       </Card>
                     </SwipeToDeleteItem>
                   </div>
                 ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-[#2D2D2A] border-t border-[#E8E6E0] dark:border-[#3D3D3A] px-4 py-4 flex justify-between items-center z-40 transform translate-z-0">
        <Button variant="ghost" className="flex flex-col gap-1 items-center h-auto py-1 text-[#5A6E4B] min-w-[70px]">
          <TrendingUp className="h-6 w-6" />
          <span className="text-[9px] font-bold uppercase tracking-tight">Dashboard</span>
        </Button>
        <div className="relative -top-8">
          <Button 
            className="h-16 w-16 rounded-full bg-[#5A6E4B] shadow-2xl flex items-center justify-center text-white ring-8 ring-[#F8F7F2]"
            onClick={() => setShowLogger(true)}
          >
            <Camera className="h-8 w-8" />
          </Button>
        </div>
        <Button variant="ghost" className="flex flex-col gap-1 items-center h-auto py-1 text-[#8E8D8A] min-w-[70px]" onClick={() => setShowWorkoutLogger(true)}>
          <Dumbbell className="h-6 w-6" />
          <span className="text-[9px] font-bold uppercase tracking-tight">Activity</span>
        </Button>
      </nav>

      {/* Slide-over Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 lg:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-80 bg-white dark:bg-[#2D2D2A] z-51 lg:hidden p-8 flex flex-col"
            >
              <div className="flex justify-between items-center mb-12">
                <div className="flex items-center gap-2 text-xl font-serif font-bold text-[#5A6E4B]">
                  <Utensils className="h-5 w-5" />
                  <span>Cal AI</span>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(false)} className="rounded-full">
                  <X className="h-6 w-6" />
                </Button>
              </div>
              
              <div className="flex-1 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#8E8D8A] mb-4">Navigation</p>
                <div 
                  onClick={() => { setActiveView('dashboard'); setIsMobileMenuOpen(false); }}
                  className={`flex items-center justify-between p-4 rounded-2xl transition-all cursor-pointer ${
                    activeView === 'dashboard' ? 'bg-[#F8F7F2] dark:bg-[#1a1a18] text-[#5A6E4B] font-bold' : 'text-[#8E8D8A] hover:bg-[#F8F7F2] dark:bg-[#1a1a18]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <TrendingUp className="h-5 w-5" />
                    Dashboard
                  </div>
                  <ChevronRight className="h-4 w-4" />
                </div>
                <div 
                  onClick={() => { setActiveView('meals'); setIsMobileMenuOpen(false); }}
                  className={`flex items-center justify-between p-4 rounded-2xl transition-all cursor-pointer ${
                    activeView === 'meals' ? 'bg-[#F8F7F2] dark:bg-[#1a1a18] text-[#5A6E4B] font-bold' : 'text-[#8E8D8A] hover:bg-[#F8F7F2] dark:bg-[#1a1a18]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Utensils className="h-5 w-5" />
                    My Meals
                  </div>
                  <ChevronRight className="h-4 w-4 opacity-50" />
                </div>
                <div 
                  onClick={() => { setActiveView('activities'); setIsMobileMenuOpen(false); }}
                  className={`flex items-center justify-between p-4 rounded-2xl transition-all cursor-pointer ${
                    activeView === 'activities' ? 'bg-[#F8F7F2] dark:bg-[#1a1a18] text-[#5A6E4B] font-bold' : 'text-[#8E8D8A] hover:bg-[#F8F7F2] dark:bg-[#1a1a18]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Dumbbell className="h-5 w-5" />
                    Activity History
                  </div>
                  <ChevronRight className="h-4 w-4 opacity-50" />
                </div>
              </div>

              <div className="mt-auto pt-8 border-t border-[#E8E6E0] dark:border-[#3D3D3A]">
                <div className="flex items-center gap-4 mb-4">
                  <div className="h-12 w-12 rounded-full bg-[#DCD9D1]" />
                  <div>
                    <p className="font-bold">{profile.name}</p>
                    <p className="text-xs text-[#8E8D8A]">Weight: {profile.weight} kg</p>
                  </div>
                </div>
                <Button 
                  variant="ghost"
                  className="w-full justify-start h-14 rounded-2xl text-[#8E8D8A] hover:bg-[#F8F7F2] dark:bg-[#1a1a18] font-bold gap-3 mb-2"
                  onClick={() => { setShowGoalEditor(true); setIsMobileMenuOpen(false); }}
                >
                  <Target className="h-5 w-5" />
                  My Goal
                </Button>
                <Button 
                  variant="ghost"
                  className="w-full justify-start h-14 rounded-2xl text-[#8E8D8A] hover:bg-[#F8F7F2] dark:bg-[#1a1a18] font-bold gap-3 mb-4"
                  onClick={() => { setShowHealthSync(true); setIsMobileMenuOpen(false); }}
                >
                  <HeartPulse className="h-5 w-5" />
                  Sync Apple Health
                </Button>
                <Button 
                  className="w-full h-14 rounded-2xl bg-[#E57373]/10 text-[#E57373] hover:bg-[#E57373]/20 font-bold gap-3"
                  onClick={() => auth.signOut()}
                >
                  <LogOut className="h-5 w-5" />
                  Sign Out
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLogger && (
          <MealLogger 
            userId={profile.userId} 
            onClose={() => setShowLogger(false)} 
            onLogged={() => fetchData(selectedDate)} 
          />
        )}
        {showWorkoutLogger && (
          <WorkoutLogger
            profile={profile}
            onClose={() => setShowWorkoutLogger(false)}
            onLogged={() => fetchData(selectedDate)}
          />
        )}
        {showStepTracker && (
          <StepTracker
            profile={profile}
            onClose={() => setShowStepTracker(false)}
            onLogged={() => fetchData(selectedDate)}
          />
        )}
        {showGoalEditor && (
          <GoalEditor
            profile={profile}
            onClose={() => setShowGoalEditor(false)}
            onSave={(goalData) => setUserGoal(goalData)}
          />
        )}
        {showHealthSync && (
          <HealthSyncModal
            userId={profile.userId}
            onClose={() => setShowHealthSync(false)}
          />
        )}
        {selectedMeal && (
          <MealDetailModal
            userId={profile.userId}
            meal={selectedMeal}
            onClose={() => setSelectedMeal(null)}
            onUpdated={(updatedMeal) => {
              setMeals(meals.map(m => m.id === updatedMeal.id ? updatedMeal : m));
              setSelectedMeal(updatedMeal);
              
              // update cache
              const dateKey = format(selectedDate, 'yyyy-MM-dd');
              const cached = localStorage.getItem(`data_${dateKey}`);
              if (cached) {
                const parsed = JSON.parse(cached);
                const updatedMealsForCache = parsed.meals.map((m: Meal) => m.id === updatedMeal.id ? updatedMeal : m);
                parsed.meals = updatedMealsForCache;
                parsed.summary.calories = updatedMealsForCache.reduce((s: number, m: Meal) => s + m.calories, 0);
                localStorage.setItem(`data_${dateKey}`, JSON.stringify(parsed));
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
