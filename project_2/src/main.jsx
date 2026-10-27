import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import HealthTriagePrototype from './prototype.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HealthTriagePrototype />
  </StrictMode>,
)
