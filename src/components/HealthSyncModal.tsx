import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { X, Copy, CheckCircle2, HeartPulse } from 'lucide-react';
import { motion } from 'motion/react';

interface HealthSyncModalProps {
  userId: string;
  onClose: () => void;
}

export default function HealthSyncModal({ userId, onClose }: HealthSyncModalProps) {
  const [copiedScript, setCopiedScript] = useState(false);
  const serverUrl = window.location.origin;

  const scriptContent = `{
  "userId": "${userId}",
  "steps": (Steps variable),
  "activeCalories": (Active Energy variable),
  "date": (Current Date)
}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(scriptContent);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ y: '10%' }}
        animate={{ y: 0 }}
        exit={{ y: '10%' }}
        className="w-full max-w-lg max-h-[90vh] flex flex-col"
      >
        <Card className="rounded-[32px] border-none bg-white shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
          <CardHeader className="flex flex-row items-center justify-between p-6 pb-2 shrink-0 border-b border-[#F1F3EE]">
            <div className="flex items-center gap-3">
               <div className="h-10 w-10 rounded-xl bg-[#E57373]/10 flex items-center justify-center">
                 <HeartPulse className="h-6 w-6 text-[#E57373]" />
               </div>
               <CardTitle className="text-xl font-serif font-bold text-[#2D2D2A]">Sync Apple Health</CardTitle>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-[#F1F3EE]">
               <X className="h-5 w-5 text-[#8E8D8A]" />
            </Button>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto p-6 space-y-6">
            <CardDescription className="text-sm text-[#8E8D8A]">
              Follow these steps exactly to automatically sync your Apple Health steps and active calories every day using iOS Shortcuts.
            </CardDescription>

            <div className="space-y-4">
               <div>
                  <h3 className="font-bold text-[#2D2D2A] text-sm mb-1">Step 1: Open Shortcuts App</h3>
                  <p className="text-sm text-[#8E8D8A]">Open the Shortcuts app on your iPhone and tap "+" to create a new Shortcut.</p>
               </div>
               <div>
                  <h3 className="font-bold text-[#2D2D2A] text-sm mb-1">Step 2: Add Actions in Order</h3>
                  <ol className="list-decimal pl-5 text-sm text-[#8E8D8A] space-y-1">
                    <li>Add <strong>"Find Health Samples"</strong> → Type: Steps</li>
                    <li>Add <strong>"Find Health Samples"</strong> → Type: Active Energy</li>
                    <li>Add <strong>"Get Contents of URL"</strong></li>
                  </ol>
               </div>
               <div className="bg-[#F8F7F2] p-4 rounded-[20px] border border-[#E8E6E0]">
                 <h3 className="font-bold text-[#2D2D2A] text-sm mb-3">Settings for "Get Contents of URL":</h3>
                 
                 <div className="space-y-3 text-sm">
                   <div>
                     <span className="font-bold text-[#8E8D8A] mr-2">URL:</span>
                     <code className="text-[#2D2D2A] bg-white px-2 py-1 rounded inline-block w-full break-all shadow-sm ring-1 ring-[#E8E6E0] mt-1">{serverUrl}/api/health-sync</code>
                   </div>
                   <div>
                     <span className="font-bold text-[#8E8D8A] mr-2">Method:</span>
                     <code className="text-[#2D2D2A] font-bold">POST</code>
                   </div>
                   <div>
                     <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-[#8E8D8A]">Body (JSON):</span>
                        <Button variant="ghost" size="sm" onClick={copyToClipboard} className="h-7 text-xs flex items-center gap-1.5 px-2">
                           {copiedScript ? <CheckCircle2 className="h-3.5 w-3.5 text-[#5A6E4B]" /> : <Copy className="h-3.5 w-3.5" />}
                           {copiedScript ? 'Copied' : 'Copy'}
                        </Button>
                     </div>
                     <pre className="text-xs bg-white p-3 rounded-xl overflow-x-auto text-[#2D2D2A] shadow-sm ring-1 ring-[#E8E6E0] whitespace-pre-wrap">
{scriptContent}
                     </pre>
                   </div>
                 </div>
               </div>
               
               <div>
                  <h3 className="font-bold text-[#2D2D2A] text-sm mb-1">Step 3: Set Automation</h3>
                  <p className="text-sm text-[#8E8D8A]">Tap "Automation" tab at the bottom → "+" → "Time of Day" → Every day at 9:00 PM → Add your new Shortcut.</p>
               </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
