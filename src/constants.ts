import type { ReactionKey } from './types';

export const CATEGORIES = [
  { key: 'tech', label: 'Tech', emoji: '💻' },
  { key: 'food', label: 'Food', emoji: '🍝' },
  { key: 'style', label: 'Style', emoji: '🧦' },
  { key: 'sport', label: 'Sport', emoji: '⚽' },
  { key: 'libre', label: 'Roast libre', emoji: '🎲' },
] as const;

export const REACTIONS: { key: ReactionKey; label: string; emoji: string }[] = [
  { key: 'brulure', label: 'Roast', emoji: '🔥' },
  { key: 'cringe', label: 'Cringe', emoji: '🙄' },
  { key: 'ko', label: 'K.O.', emoji: '👏' },
];

export const REPORT_REASONS = [
  { key: 'haine', label: 'Haine réelle ou identitaire' },
  { key: 'doxxing', label: 'Doxxing (données privées)' },
  { key: 'menace', label: 'Menace' },
  { key: 'hors-charte', label: 'Hors charte' },
  { key: 'autre', label: 'Autre' },
] as const;

export const BADGES = [
  { min: 0, label: 'Volontaire', emoji: '🙂' },
  { min: 10, label: 'Client régulier', emoji: '🔥' },
  { min: 50, label: 'Pilier du forum', emoji: '🗿' },
  { min: 200, label: 'Cuit à point', emoji: '🍳' },
  { min: 1000, label: 'Légende carbonisée', emoji: '💀' },
] as const;



export const categoryLabel = (key: string) =>
  CATEGORIES.find((category) => category.key === key)?.label ?? key;

export const categoryEmoji = (key: string) =>
  CATEGORIES.find((category) => category.key === key)?.emoji ?? '🎲';

export const formatAge = (timestamp: number) => {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} j`;
  return new Date(timestamp).toLocaleDateString('fr-FR');
};
