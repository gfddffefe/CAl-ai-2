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

  return <Dashboard profile={profile} />;
}
