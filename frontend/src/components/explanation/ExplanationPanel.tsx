import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAnalysisStore } from '../../store/analysisStore';

const levelColors: Record<string, string> = {
  beginner: 'bg-green-500/10 border-green-500/20 text-green-400',
  developer: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  advanced: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
};

const levelLabels: Record<string, string> = {
  beginner: 'Beginner',
  developer: 'Developer',
  advanced: 'Advanced',
};

export default function ExplanationPanel() {
  const { explanations } = useAnalysisStore();
  const [activeLevel, setActiveLevel] = useState<string>('beginner');

  if (!explanations || explanations.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        Run analysis to see explanations
      </div>
    );
  }

  const levels = ['beginner', 'developer', 'advanced'];
  const activeExplanation = explanations.find((e) => e.level === activeLevel) || explanations[0];

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 px-4 py-2 bg-slate-800/50 border-b border-slate-700/50">
        {levels.map((level) => (
          <button
            key={level}
            onClick={() => setActiveLevel(level)}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              activeLevel === level
                ? levelColors[level] + ' border'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            {levelLabels[level]}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4">
        <motion.div
          key={activeLevel}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <h3 className="text-sm font-medium text-slate-200 mb-2">
            {activeExplanation.title}
          </h3>
          <div className="text-sm text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
            {activeExplanation.content}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
