import React from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return <div>CS2 Coach</div>;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
