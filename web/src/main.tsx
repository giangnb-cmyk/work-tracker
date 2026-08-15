import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { installChunkErrorGuard } from './lib/lazyView';
import { initNative } from './lib/native';
import './index.css';

// Phải cài trước khi render: chunk phụ thuộc có thể hỏng ngay ở lượt preload đầu.
installChunkErrorGuard();

// Capacitor (app Android/iOS): status bar, nút Back, bàn phím, resume. No-op trên web.
initNative();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
