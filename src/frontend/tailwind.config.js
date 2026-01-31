/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.html",
    "./js/**/*.js"
  ],
  theme: {
    extend: {
      colors: {
        // Forest Green (Default Theme)
        primary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
        accent: {
          gold: '#ffd700',
          'gold-dark': '#d4af37',
        },
        // Theme-specific colors (used via CSS variables)
        theme: {
          primary: 'var(--color-primary)',
          secondary: 'var(--color-secondary)',
          accent: 'var(--color-accent)',
          bg: 'var(--color-bg)',
        },
        // Landing Page colors (Pop & Bright)
        lp: {
          primary: '#FF6B9D',
          'primary-dark': '#E55A8A',
          secondary: '#4ECDC4',
          'accent-yellow': '#FFE66D',
          'accent-orange': '#FF8C42',
          'accent-purple': '#A17FE0',
          'text-dark': '#2D3436',
          'text-light': '#636E72',
          'bg-light': '#FFF9FB',
        }
      },
      fontFamily: {
        sans: ['Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'sans-serif'],
        display: ['Playfair Display', 'serif'],
      },
      backgroundImage: {
        'gradient-forest': 'linear-gradient(135deg, #1a472a 0%, #2d5a27 50%, #0d2818 100%)',
        'gradient-rose': 'linear-gradient(135deg, #be185d 0%, #db2777 50%, #9d174d 100%)',
        'gradient-ocean': 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #1e3a8a 100%)',
        'gradient-sunset': 'linear-gradient(135deg, #c2410c 0%, #ea580c 50%, #9a3412 100%)',
        'gradient-purple': 'linear-gradient(135deg, #581c87 0%, #7c3aed 50%, #4c1d95 100%)',
      },
      animation: {
        'fade-in-down': 'fadeInDown 1s ease-out',
        'fade-in-up': 'fadeInUp 0.6s ease-out',
        'scale-in': 'scaleIn 0.5s ease-out',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        fadeInDown: {
          '0%': { opacity: '0', transform: 'translateY(-20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      boxShadow: {
        'card': '0 10px 40px rgba(0, 0, 0, 0.15)',
        'card-lg': '0 20px 60px rgba(0, 0, 0, 0.2)',
        'glow': '0 0 20px rgba(255, 215, 0, 0.3)',
      },
    }
  },
  plugins: []
}
