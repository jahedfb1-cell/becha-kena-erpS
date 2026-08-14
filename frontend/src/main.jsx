import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './store/AuthContext.jsx'
import { queryClient } from './api/queryClient.js'
import './index.css'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'

// Register PWA service worker
registerSW({ immediate: true })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Sits outside AuthProvider so auth itself can use queries later on */}
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
