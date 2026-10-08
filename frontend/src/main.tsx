import React from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas } from './Canvas'
import './style.css'

createRoot(document.getElementById('root')!).render(<React.StrictMode><Canvas /></React.StrictMode>)
