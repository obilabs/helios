import { useEffect, useState } from 'react';
import { themeService } from '../services/theme.service';

export function ThemeDebug() {
  const [theme, setTheme] = useState(themeService.getTheme());
  const [variables, setVariables] = useState<Record<string, string>>({});

  useEffect(() => {
    const updateDebugInfo = () => {
      const rootStyles = getComputedStyle(document.documentElement);
      const infoCard = document.querySelector('.info-card');
      const loginContainer = document.querySelector('.client-login-container');

      const vars: Record<string, string> = {
        '--theme-primary-start': rootStyles.getPropertyValue('--theme-primary-start').trim(),
        '--theme-primary-end': rootStyles.getPropertyValue('--theme-primary-end').trim(),
        '--theme-primary': rootStyles.getPropertyValue('--theme-primary').trim(),
        '--theme-gradient': rootStyles.getPropertyValue('--theme-gradient').trim(),
        '--theme-text-on-gradient': rootStyles.getPropertyValue('--theme-text-on-gradient').trim(),
        '--color-bg-main': rootStyles.getPropertyValue('--color-bg-main').trim(),
        '--color-text-primary': rootStyles.getPropertyValue('--color-text-primary').trim(),
      };

      if (loginContainer) {
        const containerStyles = getComputedStyle(loginContainer);
        vars['[container] background'] = containerStyles.background.substring(0, 50) + '...';
      }

      if (infoCard) {
        const cardStyles = getComputedStyle(infoCard);
        vars['[card] background'] = cardStyles.background;
        vars['[card] color'] = cardStyles.color;
      }

      setVariables(vars);
      setTheme(themeService.getTheme());
    };

    updateDebugInfo();
    const interval = setInterval(updateDebugInfo, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      position: 'fixed',
      bottom: '10px',
      right: '10px',
      background: 'rgba(0,0,0,0.8)',
      color: 'white',
      padding: '10px',
      borderRadius: '8px',
      fontSize: '11px',
      fontFamily: 'monospace',
      maxWidth: '400px',
      zIndex: 9999
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
        🎨 Theme Debug - Current: {theme}
      </div>
      <div style={{ marginBottom: '4px' }}>
        data-theme="{document.documentElement.getAttribute('data-theme')}"
      </div>
      {Object.entries(variables).map(([key, value]) => (
        <div key={key} style={{ marginBottom: '2px' }}>
          <span style={{ color: '#888' }}>{key}:</span> {value || '(empty)'}
        </div>
      ))}
    </div>
  );
}
