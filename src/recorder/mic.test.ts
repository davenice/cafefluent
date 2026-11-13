import { describe, it, expect } from 'vitest'
import { micProblem } from './mic'

/** getUserMedia's refusals, as the browsers word them. */
const refusal = (name: string, message = '') => new DOMException(message, name)

describe('micProblem', () => {
  it('tells a blocked page apart from a blocked browser', () => {
    // Chrome says the same "Permission denied" for the page's own No, and
    // "Permission denied by system" when the computer refuses the browser.
    expect(micProblem(refusal('NotAllowedError', 'Permission denied'))).toEqual({
      message: 'This page is not allowed to use the microphone.',
      fix: 'allow',
    })
    expect(micProblem(refusal('NotAllowedError', 'Permission denied by system')).fix).toBe('system')
  })

  it('asks for no setting change when the question was only closed', () => {
    const problem = micProblem(refusal('NotAllowedError', 'Permission dismissed'))
    expect(problem.fix).toBeNull()
    expect(problem.message).toMatch(/closed before you answered/)
  })

  it('says a missing microphone is missing, not denied', () => {
    expect(micProblem(refusal('NotFoundError', 'Requested device not found')).message).toMatch(/No microphone was found/)
  })

  it('says another app has the microphone', () => {
    expect(micProblem(refusal('NotReadableError', 'Could not start audio source')).message).toMatch(/busy/)
  })

  it('keeps an unknown error’s own words', () => {
    expect(micProblem(new Error('something else')).message).toBe('something else')
    expect(micProblem('odd').message).toBe('odd')
  })
})
