import { HashRouter, Routes, Route } from 'react-router-dom'
import HomePage from './components/HomePage'
import ModulePage from './components/ModulePage'
import QuizShell from './components/quiz/QuizShell'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/:moduleId" element={<ModulePage />} />
        <Route path="/:moduleId/:taskId" element={<QuizShell />} />
      </Routes>
    </HashRouter>
  )
}
