import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { LogIn, Utensils } from 'lucide-react';
import { motion } from 'motion/react';

export default function Auth() {
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login failed', error);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F7F2] p-4 font-sans">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="w-full max-w-md border-[#E8E6E0] bg-white p-8 shadow-sm rounded-[32px]">
          <CardHeader className="space-y-2 text-center pb-8">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#5A6E4B] text-white">
              <Utensils className="h-8 w-8" />
            </div>
            <CardTitle className="text-4xl font-serif font-bold tracking-tight text-[#2D2D2A]">Cal AI</CardTitle>
            <CardDescription className="text-[#8E8D8A] text-base">
              Identify food naturally with Gemini AI.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Button
              className="w-full bg-[#5A6E4B] h-14 text-lg font-bold rounded-2xl hover:bg-[#4A5E3B] transition-all shadow-md"
              onClick={handleLogin}
            >
              Sign in with Google
            </Button>
            <p className="mt-4 px-8 text-center text-xs text-[#8E8D8A] leading-relaxed">
              By joining, you agree to our <span className="underline decoration-[#E8E6E0]">Terms</span> and <span className="underline decoration-[#E8E6E0]">Privacy Policy</span>.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
