// Entry point for record.html, the page contributors' links open. Kept apart
// from the learner app: it registers no service worker and loads no app routes.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import ContributorPage from '../components/ContributorPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ContributorPage />
  </StrictMode>,
)
