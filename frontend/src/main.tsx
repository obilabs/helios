import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/tokens.css'  // Design tokens - must load before themes
import './styles/themes.css'
import './styles/cards.css'
import App from './App.tsx'
import { ErrorBoundary } from './ErrorBoundary.tsx'
import { themeService } from './services/theme.service'


// Initialize theme system after DOM is ready
if (typeof window !== 'undefined') {
  themeService.init();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
