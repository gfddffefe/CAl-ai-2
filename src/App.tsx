/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from './lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { UserProfile } from './types';
import Auth from './components/Auth';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [user, loadingAuth] = useAuthState(auth);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Theme logic
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'auto'>(() => {
    const saved = localStorage.getItem('themeMode');
    return (saved as 'light' | 'dark' | 'auto') || 'auto';
  });

  useEffect(() => {
    localStorage.setItem('themeMode', themeMode);
    
    const applyTheme = (isDark: boolean) => {
      const root = document.documentElement;
      if (isDark) {
        root.classList.add('dark');
        root.setAttribute('data-theme', 'dark');
      } else {
        root.classList.remove('dark');
        root.removeAttribute('data-theme');
      }
    };

    if (themeMode === 'light') {
      applyTheme(false);
    } else if (themeMode === 'dark') {
      applyTheme(true);
    } else {
      // auto
      const checkTime = () => {
        const hour = new Date().getHours();
        const isDark = hour >= 20 || hour < 6; // 8:00 PM to 6:00 AM
        applyTheme(isDark);
      };
      checkTime();
      const interval = setInterval(checkTime, 60000); // Check every minute
      return () => clearInterval(interval);
    }
  }, [themeMode]);

  useEffect(() => {
    async function fetchProfile() {
      if (user) {
        setLoadingProfile(true);
        try {
          const docRef = doc(db, 'users', user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          } else {
            setProfile(null);
          }
        } catch (error) {
          console.error('Error fetching profile:', error);
        } finally {
          setLoadingProfile(false);
        }
      } else {
        setProfile(null);
        setLoadingProfile(false);
      }
    }

    fetchProfile();
  }, [user]);

  if (loadingAuth || loadingProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-10 w-10 animate-spin text-black" />
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  if (!profile || !profile.onboardingCompleted) {
    return (
      <Onboarding 
        user={{ uid: user.uid, displayName: user.displayName }} 
        onComplete={(newProfile) => setProfile(newProfile)} 
      />
    );
  }

  return (
    <Dashboard 
      profile={profile} 
      themeMode={themeMode} 
      onThemeChange={setThemeMode} 
    />
  );
}
