import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom'
import HomePage from './components/HomePage'
import ModulePage from './components/ModulePage'
import QuizShell from './components/quiz/QuizShell'
import MixedQuizPage from './components/quiz/MixedQuizPage'
import FinalExamPage from './components/exam/FinalExamPage'
import PrintablePaper from './components/exam/PrintablePaper'
import CalibratePage from './components/CalibratePage'
import AdminPage from './components/AdminPage'
import DescribeGamePage from './components/DescribeGamePage'
import UpdatePrompt from './components/UpdatePrompt'

declare const __BUILD_DATE__: string
declare const __BUILD_COMMIT__: string

function BuildStamp() {
  const navigate = useNavigate()
  return (
    <p
      className="screen-only"
      style={{ position: 'fixed', bottom: 6, right: 10, fontSize: 10, color: 'rgba(0,0,0,0.2)', userSelect: 'none' }}
      onDoubleClick={() => navigate('/admin')}
    >
      {__BUILD_DATE__} · {__BUILD_COMMIT__}
    </p>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        {/* Before the module route, which otherwise matches anything. */}
        <Route path="/mixed-quiz" element={<MixedQuizPage />} />
        <Route path="/final-exam" element={<FinalExamPage />} />
        {/* Static segments outrank /:moduleId/:taskId, so this wins over it. */}
        <Route path="/final-exam/print" element={<PrintablePaper />} />
        <Route path="/:moduleId" element={<ModulePage />} />
        <Route path="/:moduleId/:taskId" element={<QuizShell />} />
        <Route path="/calibrate" element={<CalibratePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/describe-it" element={<DescribeGamePage />} />
      </Routes>
      <BuildStamp />
      <UpdatePrompt />
    </HashRouter>
  )
}
