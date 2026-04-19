import fs from 'fs';

const files = [
  'src/components/GoalEditor.tsx',
  'src/components/MealLogger.tsx',
  'src/components/WorkoutLogger.tsx',
  'src/components/StepTracker.tsx',
  'src/components/MealDetailModal.tsx',
  'src/components/HealthSyncModal.tsx'
];

for (const filePath of files) {
  if (!fs.existsSync(filePath)) continue;
  let content = fs.readFileSync(filePath, 'utf8');

  content = content.replace(/bg-white(?!\s*dark:)/g, 'bg-white dark:bg-[#2D2D2A]');
  content = content.replace(/border-\[#E8E6E0\](?!\s*dark:)/g, 'border-[#E8E6E0] dark:border-[#3D3D3A]');
  content = content.replace(/text-\[#2D2D2A\](?!\s*dark:)/g, 'text-[#2D2D2A] dark:text-[#F8F7F2]');
  content = content.replace(/bg-\[#F8F7F2\](?!\s*dark:)/g, 'bg-[#F8F7F2] dark:bg-[#1a1a18]');
  content = content.replace(/bg-\[#F1F3EE\](?!\s*dark:)/g, 'bg-[#F1F3EE] dark:bg-[#3D3D3A]');

  fs.writeFileSync(filePath, content, 'utf8');
}
console.log('Script completed');
