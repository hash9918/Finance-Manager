import React from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { startSync } from './sync';

registerSW({ immediate: true });
startSync();

function App() {
  return <main style={{ fontFamily: 'system-ui', maxWidth: 720, margin: '10vh auto', padding: 24, color: '#0f172a' }}>
    <h1>Personal Money Manager</h1>
    <p>Your offline-ready finance workspace is installed. Transaction data is stored on this device and syncs when you reconnect.</p>
    <p>Next: add the signed-in transaction ledger and quick-add form using the local Dexie database.</p>
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
