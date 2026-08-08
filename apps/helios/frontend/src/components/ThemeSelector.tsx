import { useState, useEffect } from 'react';
import { Check, Info } from 'lucide-react';
import { themeService } from '../services/theme.service';
import type { ThemeName, Theme } from '../services/theme.service';
import './ThemeSelector.css';

export function ThemeSelector() {
  const [currentTheme, setCurrentTheme] = useState<ThemeName>(themeService.getTheme());
  const [themes] = useState<Theme[]>(themeService.getAllThemes());

  useEffect(() => {
    setCurrentTheme(themeService.getTheme());
  }, []);

  const handleThemeChange = (themeId: ThemeName) => {
    themeService.setTheme(themeId);
    setCurrentTheme(themeId);
  };

  return (
    <div className="theme-selector">
      <h3>Theme Preferences</h3>
      <p className="theme-description">
        Choose a color theme that suits your preference. The selected theme will be saved and applied across all pages.
      </p>

      <div className="theme-grid">
        {themes.map((theme) => (
          <div
            key={theme.id}
            className={`theme-card ${currentTheme === theme.id ? 'active' : ''}`}
            onClick={() => handleThemeChange(theme.id)}
          >
            <div className="theme-preview" data-theme={theme.id}>
              <div className="theme-preview-gradient"></div>
            </div>
            <div className="theme-info">
              <h4>{theme.name}</h4>
              <p>{theme.description}</p>
            </div>
            {currentTheme === theme.id && (
              <span className="theme-selected"><Check size={14} /> Selected</span>
            )}
          </div>
        ))}
      </div>

      <div className="theme-note">
        <Info size={16} className="info-icon" />
        <span>
          Theme changes are saved automatically and will persist across sessions.
        </span>
      </div>
    </div>
  );
}
