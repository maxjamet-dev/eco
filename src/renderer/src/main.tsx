import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { Widget } from './Widget'
import './styles/global.css'

// Una misma build sirve la ventana principal y el widget flotante (#widget).
const isWidget = window.location.hash.startsWith('#widget')

if (isWidget) {
  // El widget vive en una ventana transparente con esquinas redondeadas.
  document.documentElement.style.background = 'transparent'
  document.body.style.background = 'transparent'
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{isWidget ? <Widget /> : <App />}</React.StrictMode>
)
