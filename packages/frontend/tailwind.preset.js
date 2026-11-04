/**
 * Shared Tailwind preset for LeMedia — colors, fonts, animations.
 *
 * Used by the core frontend (packages/frontend/tailwind.config.js) and intended to be copied
 * verbatim into any plugin that wants to use LeMedia's design language while self-compiling its
 * own CSS bundle. Plugins ship with this file inline so they stay portable (no require to the
 * core repo from ~/LeMedia/plugins/).
 *
 * Keep this in sync with the LeMedia major version: a color rename here = a plugin visual regression
 * after the next core upgrade. Version the preset with the core if you rename anything.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  theme: {
    extend: {
      colors: {
        ndp: {
          bg: '#0b0b0f',
          surface: '#141418',
          'surface-light': '#1c1c22',
          'surface-hover': '#26262d',
          accent: '#f25f4c',
          'accent-hover': '#ff7563',
          'accent-dark': '#d64b39',
          gold: '#f59e0b',
          success: '#10b981',
          danger: '#ef4444',
          warning: '#f59e0b',
          text: '#f4f1ec',
          'text-muted': '#a3a09a',
          'text-dim': '#6c6a66',
          border: '#222228',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Bebas Neue"', 'Impact', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'page-in': 'pageIn 0.25s ease-out',
        shimmer: 'shimmer 2s infinite',
        shake: 'shake 0.4s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Opacity only — a transform here would re-parent the pages' position:fixed backdrops.
        pageIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '15%, 45%, 75%': { transform: 'translateX(-6px)' },
          '30%, 60%, 90%': { transform: 'translateX(6px)' },
        },
      },
    },
  },
};
