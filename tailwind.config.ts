import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
  		fontFamily: {
  			serif: [
  				'DM Sans',
  				'sans-serif'
  			],
  			sans: [
  				'DM Sans',
  				'sans-serif'
  			],
  			// Premium display family used ONLY for hero/section headings,
  			// signature numerics, and editorial accents. Fraunces ships with
  			// optical sizing — pair with `text-display` utility in index.css.
  			display: [
  				'Fraunces',
  				'ui-serif',
  				'Georgia',
  				'serif'
  			]
  		},
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			// ── Premium surface stack ─────────────────────────────
  			// Three layered surfaces sitting above `background` give cards,
  			// nested cards, and elevated overlays a perceivable depth
  			// without resorting to heavy borders or shadows.
  			surface: {
  				1: 'hsl(var(--surface-1))',
  				2: 'hsl(var(--surface-2))',
  				3: 'hsl(var(--surface-3))'
  			},
  			'hairline': 'hsl(var(--hairline))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			success: {
  				DEFAULT: 'hsl(var(--success))',
  				foreground: 'hsl(var(--success-foreground))'
  			},
  			warning: {
  				DEFAULT: 'hsl(var(--warning))',
  				foreground: 'hsl(var(--warning-foreground))'
  			},
  			gold: {
  				DEFAULT: 'hsl(var(--gold))',
  				foreground: 'hsl(var(--gold-foreground))'
  			},
  			info: {
  				DEFAULT: 'hsl(var(--info))',
  				foreground: 'hsl(var(--info-foreground))'
  			},
  			mastery: {
  				new: 'hsl(var(--mastery-new))',
  				critical: 'hsl(var(--mastery-critical))',
  				hard: 'hsl(var(--mastery-hard))',
  				uncertain: 'hsl(var(--mastery-uncertain))',
  				stable: 'hsl(var(--mastery-stable))',
  				mastered: 'hsl(var(--mastery-mastered))'
  			},
  			node: {
  				blue: 'hsl(var(--node-blue))',
  				green: 'hsl(var(--node-green))',
  				amber: 'hsl(var(--node-amber))',
  				red: 'hsl(var(--node-red))',
  				purple: 'hsl(var(--node-purple))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		// ── Premium shadow stack ──────────────────────────────
  		// Multi-layer shadows derived from `--shadow-color` so they
  		// adapt naturally to both light and dark themes. Use sparingly:
  		// `shadow-soft` for resting cards, `shadow-elevated` on hover,
  		// `shadow-floating` for popovers and command palettes.
  		boxShadow: {
  			'soft':       'var(--shadow-soft)',
  			'elevated':   'var(--shadow-elevated)',
  			'floating':   'var(--shadow-floating)',
  			'inset-line': 'inset 0 1px 0 0 hsl(var(--hairline))',
  			'ring-focus': '0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(var(--ring) / 0.55)'
  		},
  		// Centralized z-index scale. Use these semantic tokens (e.g. `z-modal`,
  		// `z-overlay`) instead of arbitrary `z-[NN]` values so layering stays
  		// predictable across modals, popovers and global overlays.
  		// Hierarchy (low → high):
  		//   base(0) < dropdown(40) < modal(50) < modal-elevated(60) <
  		//   search(70) < overlay(100) < zen(110) < recovery(9998) < blocking(9999)
  		zIndex: {
  			'base': '0',
  			'dropdown': '40',
  			'modal': '50',           // Radix Dialog/Sheet default
  			'modal-elevated': '60',  // Custom modals above standard dialogs
  			'search': '70',          // Global search palette
  			'overlay': '100',        // Processing/loading overlays
  			'zen': '110',            // Zen mode toggle/controls
  			'recovery': '9998',      // DB recovery gate
  			'blocking': '9999'       // Hard-blocking system modal
  		},
  		keyframes: {
  			'accordion-down': {
  				from: { height: '0' },
  				to: { height: 'var(--radix-accordion-content-height)' }
  			},
  			'accordion-up': {
  				from: { height: 'var(--radix-accordion-content-height)' },
  				to: { height: '0' }
  			},
  			shimmer: {
  				'100%': { transform: 'translateX(100%)' }
  			},
  			// ── Premium micro-motion ──────────────────────────
  			'fade-in': {
  				'0%':   { opacity: '0' },
  				'100%': { opacity: '1' }
  			},
  			'fade-up': {
  				'0%':   { opacity: '0', transform: 'translateY(12px)' },
  				'100%': { opacity: '1', transform: 'translateY(0)' }
  			},
  			'fade-down': {
  				'0%':   { opacity: '0', transform: 'translateY(-8px)' },
  				'100%': { opacity: '1', transform: 'translateY(0)' }
  			},
  			'scale-in': {
  				'0%':   { opacity: '0', transform: 'scale(0.96)' },
  				'100%': { opacity: '1', transform: 'scale(1)' }
  			},
  			'subtle-pulse': {
  				'0%, 100%': { opacity: '1' },
  				'50%':      { opacity: '0.72' }
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up':   'accordion-up 0.2s ease-out',
  			'fade-in':        'fade-in 0.28s cubic-bezier(0.22, 0.61, 0.36, 1) both',
  			'fade-up':        'fade-up 0.34s cubic-bezier(0.22, 0.61, 0.36, 1) both',
  			'fade-down':      'fade-down 0.28s cubic-bezier(0.22, 0.61, 0.36, 1) both',
  			'scale-in':       'scale-in 0.22s cubic-bezier(0.22, 0.61, 0.36, 1) both',
  			'shimmer':        'shimmer 1.6s linear infinite',
  			'subtle-pulse':   'subtle-pulse 2.4s ease-in-out infinite'
  		},
  		transitionTimingFunction: {
  			'premium': 'cubic-bezier(0.22, 0.61, 0.36, 1)'
  		}
  	}
  },
  plugins: [tailwindcssAnimate, typography],
} satisfies Config;
