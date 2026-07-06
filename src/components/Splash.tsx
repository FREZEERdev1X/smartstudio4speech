import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export default function Splash() {
  const [visible, setVisible] = useState(true);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const duration = 10000; // 10 seconds
    const intervalTime = 50;
    const steps = duration / intervalTime;
    let currentStep = 0;

    const interval = setInterval(() => {
      currentStep++;
      setProgress(100 - (currentStep / steps) * 100);
      if (currentStep >= steps) {
        clearInterval(interval);
        setVisible(false);
      }
    }, intervalTime);

    return () => clearInterval(interval);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-white/40 backdrop-blur-xl p-4"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-[420px] bg-white rounded-3xl shadow-2xl border border-white p-8 text-center relative overflow-hidden"
            dir="rtl"
          >
            <div className="mb-6 inline-flex w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full items-center justify-center">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2" dir="rtl">
              أهلاً بك في استوديو الصوت الذكي
            </h2>
            <p className="text-slate-500 text-lg mb-8" dir="rtl">
              تم تطوير التطبيق بواسطة حمدي محمد
            </p>
            
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-indigo-600 rounded-full"
                style={{ width: `${progress}%` }}
                layout
              />
            </div>
            <div className="mt-3 flex justify-center items-center gap-2">
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                سيختفي الإشعار بعد {Math.ceil((progress / 100) * 10)} ثواني
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
