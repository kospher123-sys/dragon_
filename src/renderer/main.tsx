import { createRoot } from 'react-dom/client';
import { App } from './App';
import { BattlePage } from './components/Battle';
import { startOverlay } from './desktop/overlay';
import './styles.css';

if (location.hash === '#desktop') {
  void startOverlay(window.api.desktop);
} else {
  const root = createRoot(document.getElementById('root')!);
  root.render(location.hash === '#battle' ? <BattlePage /> : <App />);
}
