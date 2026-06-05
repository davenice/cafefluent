import { HashRouter, Routes, Route } from 'react-router-dom'
import HomePage from './components/HomePage'
import ModulePage from './components/ModulePage'
import QuizShell from './components/quiz/QuizShell'
import CalibratePage from './components/CalibratePage'

declare const __BUILD_DATE__: string
declare const __BUILD_COMMIT__: string

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/:moduleId" element={<ModulePage />} />
        <Route path="/:moduleId/:taskId" element={<QuizShell />} />
        <Route path="/calibrate" element={<CalibratePage />} />
      </Routes>
      <p style={{ position: 'fixed', bottom: 6, right: 10, fontSize: 10, color: 'rgba(0,0,0,0.2)', pointerEvents: 'none' }}>
        {__BUILD_DATE__} · {__BUILD_COMMIT__}
      </p>
    </HashRouter>
  )
}
