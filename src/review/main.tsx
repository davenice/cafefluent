// Entry point for review.html, the local page for listening to the audio
// options for each phrase. Not part of the app or the build: no service
// worker, no routes, and it only works under the dev server.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import ReviewPage from '../components/ReviewPage'

createRoot(document.getElementById('review-root')!).render(
  <StrictMode>
    <ReviewPage />
  </StrictMode>,
)
