import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import NumberField from './NumberField'

function Harness({ onChange }: { onChange: (n: number) => void }) {
  const [value, setValue] = useState(40)
  return (
    <>
      <NumberField
        label="Limit"
        hint="Lower lets in more noise."
        value={value}
        min={20}
        max={70}
        onChange={(n) => {
          setValue(n)
          onChange(n)
        }}
      />
      <button>elsewhere</button>
    </>
  )
}

describe('NumberField', () => {
  it('can be cleared and typed into without the value fighting back', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const input = screen.getByLabelText(/Limit/)

    await user.clear(input)
    expect(input).toHaveValue('')
    expect(onChange).not.toHaveBeenCalled()

    await user.type(input, '35')
    expect(input).toHaveValue('35')
    expect(onChange).toHaveBeenLastCalledWith(35)
  })

  it('takes a decimal with a comma', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const input = screen.getByLabelText(/Limit/)
    await user.clear(input)
    await user.type(input, '32,5')
    expect(onChange).toHaveBeenLastCalledWith(32.5)
  })

  it('says what it needs while the text is out of range, and keeps the last good value', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const input = screen.getByLabelText(/Limit/)

    await user.clear(input)
    await user.type(input, '5')
    expect(screen.getByText('Enter a number from 20 to 70.')).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(onChange).not.toHaveBeenCalled()

    // Leaving the field puts back the value in use.
    await user.click(screen.getByText('elsewhere'))
    expect(input).toHaveValue('40')
    expect(screen.getByText('Lower lets in more noise.')).toBeInTheDocument()
  })
})
