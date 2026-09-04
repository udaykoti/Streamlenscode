import { motion } from 'framer-motion';
import type { Classification } from '../../types';

const colorMap: Record<Classification, string> = {
  'SAFE': 'bg-green-500/20 text-green-400 border-green-500/30',
  'CONDITIONALLY SAFE': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'UNSAFE': 'bg-red-500/20 text-red-400 border-red-500/30',
  'UNKNOWN': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const iconMap: Record<Classification, string> = {
  'SAFE': 'SAFE',
  'CONDITIONALLY SAFE': 'COND',
  'UNSAFE': 'UNSAFE',
  'UNKNOWN': '?',
};

interface Props {
  classification: Classification;
  size?: 'sm' | 'md' | 'lg';
}

export default function ClassificationBadge({ classification, size = 'md' }: Props) {
  const normalized = classification.toUpperCase().includes('SAFE') && !classification.toUpperCase().includes('UNSAFE')
    ? classification.toUpperCase().includes('CONDITION')
      ? 'CONDITIONALLY SAFE' as Classification
      : 'SAFE' as Classification
    : classification.toUpperCase().includes('UNSAFE')
      ? 'UNSAFE' as Classification
      : 'UNKNOWN' as Classification;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-2',
  };

  return (
    <motion.span
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`inline-flex items-center gap-1.5 rounded-full border font-mono font-bold ${colorMap[normalized]} ${sizeClasses[size]}`}
    >
      <span className="opacity-60">{iconMap[normalized]}</span>
      {normalized}
    </motion.span>
  );
}
