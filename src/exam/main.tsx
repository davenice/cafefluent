// Entry point for exam.html, the prototype of the final exam. Not part of the
// app or the build: exam.html is deliberately left out of the build inputs in
// vite.config.ts, so it works under the dev server and is never deployed.
//
// When the exam moves into the app it becomes a route in src/App.tsx and this
// page goes away; the components under src/exam/ and src/components/exam/ are
// the same either way.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import FinalExamPage from '../components/exam/FinalExamPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FinalExamPage />
  </StrictMode>,
)
