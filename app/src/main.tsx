import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// 起動直後の予期しない失敗も、利用者には日本語で知らせる。
window.onerror = function(msg, _url, line, _col, error) {
  console.error(msg, error)
  alert(`予期しないエラーが起きました（${line}行目）。アプリを開き直してください。`)
  return false;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
