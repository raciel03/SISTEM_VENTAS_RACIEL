import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

const rootEl = document.getElementById("root")!;
try {
  createRoot(rootEl).render(<App />);
  requestAnimationFrame(() => {
    document.getElementById('boot-status')?.classList.add('hidden');
  });
} catch (e: unknown) {
  const b = document.getElementById('boot-status');
  const message = e instanceof Error ? e.message : String(e);
  if (b) {
    b.classList.remove('hidden');
    b.className = 'error';
    b.innerHTML = '<div class="box">Error al iniciar: ' + (message || 'revisa la consola') + '</div>';
  }
  throw e;
}
