import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';
import { restoreSession } from './features/auth';

// Trước khi render và ngoài effect: StrictMode chạy effect hai lần, mà làm mới phải chạy đúng một lần
void restoreSession();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
