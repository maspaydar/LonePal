import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 3000),
      setTimeout(() => setPhase(4), 4500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center bg-primary"
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "-100%" }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="max-w-6xl mx-auto w-full px-12 grid grid-cols-2 gap-16 relative z-10">
        
        <div className="col-span-2 text-center mb-8">
          <motion.h2 
            className="text-5xl font-display font-bold text-text-inverse"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: phase >= 1 ? 1 : 0, scale: phase >= 1 ? 1 : 0.9 }}
            transition={{ duration: 0.6 }}
          >
            How it works: Two AI Agents
          </motion.h2>
        </div>

        {/* Agent 1 */}
        <motion.div 
          className="bg-bg-light/10 backdrop-blur-md rounded-3xl p-10 border border-white/20 text-text-inverse"
          initial={{ opacity: 0, x: -50, rotateY: -20 }}
          animate={{ opacity: phase >= 2 ? 1 : 0, x: phase >= 2 ? 0 : -50, rotateY: phase >= 2 ? 0 : -20 }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
        >
          <div className="w-16 h-16 rounded-full bg-accent text-primary flex items-center justify-center mb-6">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
              <path d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2z"/>
              <path d="M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/>
              <path d="M15.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/>
              <path d="M15.5 14a3.5 3.5 0 0 1-7 0"/>
            </svg>
          </div>
          <h3 className="text-3xl font-display font-bold mb-4">The Companion</h3>
          <p className="text-xl opacity-80 font-body">A friendly voice that engages the resident in natural, meaningful conversation.</p>
        </motion.div>

        {/* Agent 2 */}
        <motion.div 
          className="bg-bg-light/10 backdrop-blur-md rounded-3xl p-10 border border-white/20 text-text-inverse"
          initial={{ opacity: 0, x: 50, rotateY: 20 }}
          animate={{ opacity: phase >= 3 ? 1 : 0, x: phase >= 3 ? 0 : 50, rotateY: phase >= 3 ? 0 : 20 }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
        >
          <div className="w-16 h-16 rounded-full bg-accent text-primary flex items-center justify-center mb-6">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="M12 8v4"/>
              <path d="M12 16h.01"/>
            </svg>
          </div>
          <h3 className="text-3xl font-display font-bold mb-4">The Monitor</h3>
          <p className="text-xl opacity-80 font-body">Silently assesses safety from presence sensors and conversation context.</p>
        </motion.div>

      </div>
    </motion.div>
  );
}