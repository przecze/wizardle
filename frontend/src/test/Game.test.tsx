import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../utils', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../utils')>()
  return {
    ...orig,
    todayStr: () => TEST_DATE,
    apiFetch: vi.fn(),
  }
})

import { apiFetch } from '../utils'
import Game from '../components/Game'
import {
  TEST_DATE,
  MOCK_PUZZLE,
  MOCK_WORD_LEFT,
  MOCK_WORD_RIGHT,
  MOCK_GUESS_WRONG,
  MOCK_GUESS_RIGHT_BOOK,
  MOCK_GUESS_CORRECT,
} from './fixtures'

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>

/** Render Game and wait for the initial puzzle to load */
async function renderGame() {
  const user = userEvent.setup()
  render(<Game />)
  await waitFor(() => {
    expect(screen.getByText('dark')).toBeInTheDocument()
  })
  return user
}

/** Helper: select a book, pick a chapter, submit the guess */
async function makeGuess(user: ReturnType<typeof userEvent.setup>, bookRoman: string, chapterName: string) {
  // Click book button
  await user.click(screen.getByRole('button', { name: bookRoman }))

  // GuessDialog opens — click the chapter
  await user.click(screen.getByRole('button', { name: new RegExp(chapterName) }))

  // Click submit
  await user.click(screen.getByRole('button', { name: /submit guess/i }))
}

/** Helper: dismiss the GuessAnimation splash by clicking its backdrop */
async function dismissSplash(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => {
    expect(document.querySelector('.splash-backdrop')).toBeInTheDocument()
  })
  await user.click(document.querySelector('.splash-backdrop')!)
}

beforeEach(() => {
  localStorage.clear()
  mockApiFetch.mockReset()
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path.startsWith('/puzzle')) return MOCK_PUZZLE
    throw new Error(`Unmocked apiFetch path: ${path}`)
  })
})

describe('Game integration tests', () => {
  it('reveals a word to the left and right', async () => {
    const user = await renderGame()

    // Mock word reveal for left
    mockApiFetch.mockResolvedValueOnce(MOCK_WORD_LEFT)
    await user.click(screen.getByLabelText('Add word to the left'))
    await waitFor(() => {
      expect(screen.getByText('the')).toBeInTheDocument()
    })

    // Mock word reveal for right
    mockApiFetch.mockResolvedValueOnce(MOCK_WORD_RIGHT)
    await user.click(screen.getByLabelText('Add word to the right'))
    await waitFor(() => {
      expect(screen.getByText('was')).toBeInTheDocument()
    })

    // Progress log should show both word moves
    expect(screen.getByText(/added word on the left/)).toBeInTheDocument()
    expect(screen.getByText(/added word on the right/)).toBeInTheDocument()
  })

  it('handles wrong book guess', async () => {
    const user = await renderGame()

    mockApiFetch.mockResolvedValueOnce(MOCK_GUESS_WRONG)
    await makeGuess(user, 'I', 'The Boy Who Lived')
    await dismissSplash(user)

    // Book I button should be ruled out (disabled)
    const bookBtn = screen.getByRole('button', { name: 'I' })
    expect(bookBtn).toBeDisabled()

    // Progress log shows wrong guess
    expect(screen.getByText(/Wrong book/)).toBeInTheDocument()
  })

  it('handles right book but wrong chapter guess', async () => {
    const user = await renderGame()

    mockApiFetch.mockResolvedValueOnce(MOCK_GUESS_RIGHT_BOOK)
    await makeGuess(user, 'I', 'The Boy Who Lived')
    await dismissSplash(user)

    // Book I should still be enabled (confirmed book)
    const bookBtn = screen.getByRole('button', { name: 'I' })
    expect(bookBtn).toBeEnabled()

    // Other books should be locked out (disabled)
    const bookBtnII = screen.getByRole('button', { name: 'II' })
    expect(bookBtnII).toBeDisabled()

    // Progress log shows right book
    expect(screen.getByText(/Right book, wrong chapter/)).toBeInTheDocument()
  })

  it('handles correct guess and shows success dialog', async () => {
    const user = await renderGame()

    mockApiFetch.mockResolvedValueOnce(MOCK_GUESS_CORRECT)
    await makeGuess(user, 'I', 'The Boy Who Lived')
    await dismissSplash(user)

    // SuccessDialog should render with book name and chapter
    await waitFor(() => {
      expect(screen.getByText(/Philosopher's Stone/)).toBeInTheDocument()
    })
    expect(document.querySelector('.success-dialog__chapter')!.textContent).toMatch(/The Boy Who Lived/)
    expect(screen.getByText(/42\.5% into the chapter/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /share result/i })).toBeInTheDocument()
  })

  it('copies share text to clipboard', async () => {
    const user = await renderGame()

    mockApiFetch.mockResolvedValueOnce(MOCK_GUESS_CORRECT)
    await makeGuess(user, 'I', 'The Boy Who Lived')
    await dismissSplash(user)

    // Wait for success dialog
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /share result/i })).toBeInTheDocument()
    })

    // Spy on clipboard.writeText at the point user-event has set it up
    const writeSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    await user.click(screen.getByRole('button', { name: /share result/i }))

    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining('wizardle.janczechowski.com')
    )
  })

  it('navigates to previous day', async () => {
    const user = await renderGame()

    // Set up mock for the new date's puzzle fetch
    const prevDatePuzzle = { ...MOCK_PUZZLE, date: '2026-01-14' }
    mockApiFetch.mockResolvedValueOnce(prevDatePuzzle)

    await user.click(screen.getByLabelText('Previous puzzle'))

    // Should fetch puzzle with previous date
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('2026-01-14')
      )
    })

    // Date display should update
    expect(screen.getByText('2026-01-14')).toBeInTheDocument()
  })
})
