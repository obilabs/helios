// Theme Service for Helios Client Portal

export type ThemeName = 'default' | 'helios-purple' | 'google-blue' | 'modern-teal' | 'corporate-blue' | 'sophisticated-purple' | 'helios-dark';

export interface Theme {
  id: ThemeName;
  name: string;
  description: string;
}

export const availableThemes: Theme[] = [
  {
    id: 'helios-purple',
    name: 'Helios Purple',
    description: 'Original Helios brand purple (Default)'
  },
  {
    id: 'corporate-blue',
    name: 'Corporate Blue',
    description: 'Professional, trustworthy, and calm'
  },
  {
    id: 'sophisticated-purple',
    name: 'Sophisticated Purple',
    description: 'Modern, sophisticated, and focused'
  },
  {
    id: 'helios-dark',
    name: 'Dark Mode',
    description: 'Sleek, functional, and tech-forward'
  },
  {
    id: 'google-blue',
    name: 'Google Workspace Blue',
    description: 'Google Workspace inspired blue'
  },
  {
    id: 'modern-teal',
    name: 'Modern Teal',
    description: 'Fresh modern teal gradient'
  },
  {
    id: 'default',
    name: 'Soft Purple',
    description: 'Lighter, softer purple variant'
  }
];

class ThemeService {
  private currentTheme: ThemeName;
  private initialized: boolean = false;
  private readonly DEFAULT_THEME: ThemeName;

  constructor() {
    // Get default theme from env variable (single source of truth)
    const envTheme = import.meta.env.VITE_DEFAULT_THEME as ThemeName;
    this.DEFAULT_THEME = this.isValidTheme(envTheme) ? envTheme : 'helios-purple';
    this.currentTheme = this.DEFAULT_THEME;
  }

  private loadTheme(): void {
    try {
      // Check localStorage for saved theme (only if available)
      if (typeof localStorage !== 'undefined') {
        const savedTheme = localStorage.getItem('helios_theme') as ThemeName | null;

        if (savedTheme && this.isValidTheme(savedTheme)) {
          this.currentTheme = savedTheme;
        } else {
          this.currentTheme = this.DEFAULT_THEME;
        }
      } else {
        this.currentTheme = this.DEFAULT_THEME;
      }

      this.applyTheme(this.currentTheme);
    } catch (error) {
      console.error('Error loading theme:', error);
      this.currentTheme = this.DEFAULT_THEME;
      this.applyTheme(this.DEFAULT_THEME);
    }
  }

  private isValidTheme(theme: string): theme is ThemeName {
    return ['default', 'helios-purple', 'google-blue', 'modern-teal', 'corporate-blue', 'sophisticated-purple', 'helios-dark'].includes(theme);
  }

  public setTheme(theme: ThemeName, skipAuthCheck: boolean = false): void {
    // Security check - only admins can change themes (unless during setup)
    if (!skipAuthCheck && typeof localStorage !== 'undefined') {
      const userStr = localStorage.getItem('helios_user');
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          if (user.role !== 'admin') {
            console.warn('Only administrators can change themes');
            return;
          }
        } catch (e) {
          console.error('Error parsing user data');
          return;
        }
      }
    }

    if (!this.isValidTheme(theme)) {
      console.warn(`Invalid theme: ${theme}. Using helios-purple.`);
      theme = 'helios-purple';
    }

    this.currentTheme = theme;

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('helios_theme', theme);
    }

    this.applyTheme(theme);
  }

  /**
   * Set theme during initial setup (bypasses auth check)
   */
  public setInitialTheme(theme: ThemeName): void {
    this.setTheme(theme, true);
  }

  private applyTheme(theme: ThemeName): void {
    try {
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.setAttribute('data-theme', theme);
      }
    } catch (error) {
      console.error('Error applying theme:', error);
    }
  }

  public getTheme(): ThemeName {
    return this.currentTheme;
  }

  public getThemeInfo(): Theme | undefined {
    return availableThemes.find(t => t.id === this.currentTheme);
  }

  public getAllThemes(): Theme[] {
    return availableThemes;
  }

  public init(): void {
    if (!this.initialized) {
      this.initialized = true;
      this.loadTheme();
    }
  }
}

export const themeService = new ThemeService();
