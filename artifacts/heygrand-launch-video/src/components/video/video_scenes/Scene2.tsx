import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import seniorHappyImg from '@/assets/images/senior-happy.png';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 3000),
      setTimeout(() => setPhase(4), 5500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center"
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
      transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="w-1/2 h-full relative z-10 flex flex-col justify-center px-16">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: phase >= 1 ? 1 : 0, x: phase >= 1 ? 0 : -20 }}
          transition={{ duration: 0.6 }}
          className="font-accent text-2xl text-primary mb-4"
        >
          The Solution
        </motion.div>

        <motion.h2
          className="text-5xl lg:text-6xl font-display font-bold text-text-primary leading-tight mb-8"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: phase >= 2 ? 1 : 0, y: phase >= 2 ? 0 : 30 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          Always-on presence.<br/>
          <span className="text-primary">No wearables. No buttons.</span>
        </motion.h2>

        <motion.p
          className="text-2xl text-text-secondary font-body"
          initial={{ opacity: 0 }}
          animate={{ opacity: phase >= 3 ? 1 : 0 }}
          transition={{ duration: 0.8 }}
        >
          A warm AI companion that seniors actually look forward to talking to.
        </motion.p>
      </div>

      <motion.div 
        className="w-1/2 h-full absolute right-0 top-0 overflow-hidden"
        initial={{ opacity: 0, clipPath: 'polygon(100% 0, 100% 0, 100% 100%, 100% 100%)' }}
        animate={{ opacity: 1, clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      >
        <img src={seniorHappyImg} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-l from-transparent to-bg-muted" />
      </motion.div>
    </motion.div>
  );
}