import React, { useState } from 'react';
import { EMOJI_CATEGORIES } from './emoji-data';

const RECENT_EMOJIS_KEY = 'chatspace:recent-emojis';
const MAX_RECENT_EMOJIS = 24;

function loadRecentEmojis() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(RECENT_EMOJIS_KEY));
    return Array.isArray(saved) ? saved.slice(0, MAX_RECENT_EMOJIS) : [];
  } catch {
    return [];
  }
}

const EmojiPicker = ({ onSelect, onClose }) => {
  const [recentEmojis, setRecentEmojis] = useState(loadRecentEmojis);
  const [activeCategoryId, setActiveCategoryId] = useState(
    recentEmojis.length ? 'recent' : EMOJI_CATEGORIES[0].id
  );
  const categories = recentEmojis.length
    ? [
        {
          id: 'recent',
          label: 'Recently used',
          icon: '🕘',
          emojis: recentEmojis,
        },
        ...EMOJI_CATEGORIES,
      ]
    : EMOJI_CATEGORIES;
  const activeCategory =
    categories.find(category => category.id === activeCategoryId) ||
    categories[0];

  const selectEmoji = emoji => {
    const nextRecent = [
      emoji,
      ...recentEmojis.filter(item => item !== emoji),
    ].slice(0, MAX_RECENT_EMOJIS);
    setRecentEmojis(nextRecent);
    window.localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(nextRecent));
    onSelect(emoji);
  };

  return (
    <section className="emoji-picker" aria-label="Emoji picker">
      <header className="emoji-picker__header">
        <strong>{activeCategory.label}</strong>
        <button type="button" onClick={onClose} aria-label="Close emoji picker">
          ×
        </button>
      </header>
      <div
        className="emoji-picker__tabs"
        role="tablist"
        aria-label="Emoji categories"
      >
        {categories.map(category => (
          <button
            key={category.id}
            type="button"
            role="tab"
            aria-selected={category.id === activeCategory.id}
            className={category.id === activeCategory.id ? 'is-active' : ''}
            onClick={() => setActiveCategoryId(category.id)}
            title={category.label}
          >
            {category.icon}
          </button>
        ))}
      </div>
      <div className="emoji-picker__grid" role="tabpanel">
        {activeCategory.emojis.map(emoji => (
          <button
            key={emoji}
            type="button"
            onClick={() => selectEmoji(emoji)}
            aria-label={`Add ${emoji} emoji`}
            title={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
    </section>
  );
};

export default EmojiPicker;
