import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { installChunkErrorGuard } from './lib/lazyView';
import './index.css';

// Phải cài trước khi render: chunk phụ thuộc có thể hỏng ngay ở lượt preload đầu.
installChunkErrorGuard();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
