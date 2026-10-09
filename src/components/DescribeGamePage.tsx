import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DESCRIBE_GAME } from '../data/modules'
import { useGameSettings } from '../game/settings'
import {
  answer, currentPlayer, currentWord, endGame, newGame, playerTurnNumber, startTurn,
  summarise, timeUp, turnIndex, undo, type GameState,
} from '../game/describeGame'

// The game in progress is saved after every tap, so a reload, a phone call or
// switching apps doesn't lose it.
const STORAGE_KEY = 'cafefluent/describe-it/game'
const PLAYERS_KEY = 'cafefluent/describe-it/players'

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function save(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private mode or storage full: the game still works, it just won't survive a reload.
  }
}

export default function DescribeGamePage() {
  const navigate = useNavigate()
  const settings = useGameSettings()
  const [game, setGame] = useState<GameState | null>(() => load<GameState>(STORAGE_KEY))
  const [players, setPlayers] = useState<string[]>(() => load<string[]>(PLAYERS_KEY) ?? [])
  const audio = useRef<AudioContext | null>(null)

  useEffect(() => save(STORAGE_KEY, game), [game])
  useEffect(() => save(PLAYERS_KEY, players), [players])

  function start() {
    if (!settings) return
    setGame(newGame(players, settings.words, settings.seconds, settings.turns))
  }

  function startTurnNow() {
    // Created on a tap, because browsers only allow sound after the user has touched the page.
    if (!audio.current && 'AudioContext' in window) audio.current = new AudioContext()
    setGame(g => g && startTurn(g, Date.now()))
  }

  function onTimeUp() {
    beep(audio.current)
    navigator.vibrate?.(400)
    setGame(g => g && timeUp(g))
  }

  const back = <button style={styles.back} onClick={() => navigate('/')}>← Home</button>

  if (!game) {
    return (
      <div style={styles.page}>
        <header style={styles.header}>
          {back}
          <h1 style={styles.title}>{DESCRIBE_GAME.title}</h1>
          <p style={styles.muted}>{DESCRIBE_GAME.description}</p>
        </header>
        {settings === null ? null : settings.words.length === 0 ? (
          <p style={styles.notice}>There are no words yet. Ask your teacher.</p>
        ) : (
          <Setup players={players} setPlayers={setPlayers} turns={settings.turns} seconds={settings.seconds} onStart={start} />
        )}
      </div>
    )
  }

  if (game.phase === 'handover') {
    const last = game.history[game.history.length - 1]
    const lastScore = last?.results.filter(r => r.guessed).length
    return (
      <div style={styles.page}>
        <header style={styles.header}>{back}</header>
        <main style={styles.centre}>
          {last && (
            <p style={styles.lastTurn}>
              {last.player} got {lastScore} {lastScore === 1 ? 'word' : 'words'}.
            </p>
          )}
          <p style={styles.muted}>Pass the phone to</p>
          <p style={styles.bigName}>{currentPlayer(game)}</p>
          <p style={styles.muted}>Turn {turnIndex(game) + 1} of {game.turns}</p>
          <p style={styles.rule}>Describe the word. Do not say the word.</p>
          <button style={styles.primary} onClick={startTurnNow}>Start</button>
        </main>
        <button
          style={styles.endGame}
          onClick={() => { if (confirm('End the game now?')) setGame(endGame(game)) }}
        >
          End game
        </button>
      </div>
    )
  }

  if (game.phase === 'playing' || game.phase === 'time-up') {
    return <Turn game={game} setGame={setGame} onTimeUp={onTimeUp} />
  }

  return (
    <Results
      game={game}
      onPlayAgain={() => setGame(newGame(game.players, game.words, game.seconds, game.turns))}
      onNewPlayers={() => setGame(null)}
      onHome={() => { setGame(null); navigate('/') }}
    />
  )
}

function Setup({ players, setPlayers, turns, seconds, onStart }: {
  players: string[]
  setPlayers: (p: string[]) => void
  turns: number
  seconds: number
  onStart: () => void
}) {
  const [name, setName] = useState('')

  function add() {
    const trimmed = name.trim()
    if (!trimmed || players.includes(trimmed)) return
    setPlayers([...players, trimmed])
    setName('')
  }

  return (
    <main style={styles.setup}>
      <h2 style={styles.sectionTitle}>Who is playing?</h2>
      <form style={styles.addRow} onSubmit={e => { e.preventDefault(); add() }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Name"
          style={styles.nameInput}
          maxLength={20}
          autoFocus
        />
        <button type="submit" style={styles.addButton} disabled={!name.trim()}>Add</button>
      </form>
      <ol style={styles.playerList}>
        {players.map(p => (
          <li key={p} style={styles.playerRow}>
            <span>{p}</span>
            <button style={styles.remove} onClick={() => setPlayers(players.filter(x => x !== p))} aria-label={`Remove ${p}`}>✕</button>
          </li>
        ))}
      </ol>
      <p style={styles.muted}>{turns} turns. {seconds} seconds for each turn.</p>
      <button style={styles.primary} onClick={onStart} disabled={players.length < 2}>
        {players.length < 2 ? 'Add 2 or more players' : 'Start the game'}
      </button>
    </main>
  )
}

function Turn({ game, setGame, onTimeUp }: {
  game: GameState
  setGame: (update: (g: GameState | null) => GameState | null) => void
  onTimeUp: () => void
}) {
  const [now, setNow] = useState(Date.now)
  const playing = game.phase === 'playing'

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(id)
  }, [playing])

  const secondsLeft = playing ? Math.max(0, Math.ceil((game.turnEndsAt! - now) / 1000)) : 0
  useEffect(() => {
    if (playing && secondsLeft === 0) onTimeUp()
  }, [playing, secondsLeft, onTimeUp])

  useWakeLock(playing)

  const turn = game.history[game.history.length - 1]
  const lastResult = turn.results[turn.results.length - 1]
  const guessedThisTurn = turn.results.filter(r => r.guessed).length
  const word = currentWord(game)
  const tap = (guessed: boolean) => setGame(g => g && answer(g, guessed, Date.now()))

  return (
    <div style={styles.turnPage}>
      <header style={styles.turnHeader}>
        <span style={styles.turnPlayer}>{currentPlayer(game)}{playerTurnNumber(game) > 1 ? ` (turn ${playerTurnNumber(game)})` : ''}</span>
        {playing
          ? <span style={{ ...styles.timer, ...(secondsLeft <= 10 ? styles.timerLow : {}) }}>{secondsLeft}</span>
          : <span style={{ ...styles.timer, ...styles.timerLow }}>0</span>}
      </header>

      <p style={styles.turnScore}>Guessed: {guessedThisTurn}</p>

      <main style={styles.wordArea}>
        {!playing && <p style={styles.timeUp}>Time's up! Did they guess it?</p>}
        <p style={styles.word}>{word}</p>
      </main>

      <div style={styles.undoRow}>
        {lastResult && (
          <button style={styles.undo} onClick={() => setGame(g => g && undo(g))}>
            ↶ Undo “{lastResult.word}”
          </button>
        )}
      </div>

      <footer style={styles.answerRow}>
        <button style={styles.skip} onClick={() => tap(false)}>{playing ? 'Skip' : 'No'}</button>
        <button style={styles.gotIt} onClick={() => tap(true)}>{playing ? 'Got it' : 'Yes'}</button>
      </footer>
    </div>
  )
}

function Results({ game, onPlayAgain, onNewPlayers, onHome }: {
  game: GameState
  onPlayAgain: () => void
  onNewPlayers: () => void
  onHome: () => void
}) {
  const s = summarise(game)
  return (
    <div style={styles.page}>
      <header style={{ ...styles.header, textAlign: 'center' }}>
        <h1 style={styles.title}>Well done!</h1>
      </header>
      <main style={styles.setup}>
        <div style={styles.scoreCard}>
          <p style={styles.score}>{s.wordsPerTurn.toFixed(1)}</p>
          <p style={styles.scoreLabel}>words for each turn</p>
          <p style={styles.muted}>
            {s.totalGuessed} {s.totalGuessed === 1 ? 'word' : 'words'} in {s.turnsPlayed} {s.turnsPlayed === 1 ? 'turn' : 'turns'}
          </p>
        </div>

        <section style={styles.listCard}>
          {s.byPlayer.map(p => (
            <div key={p.player} style={styles.resultRow}>
              <span>{p.player}</span>
              <span style={styles.muted}>{p.guessed} {p.guessed === 1 ? 'word' : 'words'}</span>
            </div>
          ))}
        </section>

        {s.skipped.length > 0 && (
          <WordList title="Words you skipped" words={s.skipped} />
        )}
        {s.guessed.length > 0 && (
          <WordList title="Words you guessed" words={s.guessed} />
        )}

        <button style={styles.primary} onClick={onPlayAgain}>Play again</button>
        <div style={styles.secondaryRow}>
          <button style={styles.secondary} onClick={onNewPlayers}>New players</button>
          <button style={styles.secondary} onClick={onHome}>Home</button>
        </div>
      </main>
    </div>
  )
}

function WordList({ title, words }: { title: string; words: string[] }) {
  return (
    <section style={styles.listCard}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      <div style={styles.chips}>
        {words.map(w => <span key={w} style={styles.chip}>{w}</span>)}
      </div>
    </section>
  )
}

/** Stops the screen going dark while the timer runs. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let released = false
    navigator.wakeLock.request('screen').then(l => {
      if (released) l.release()
      else lock = l
    }).catch(() => {})
    return () => { released = true; lock?.release() }
  }, [active])
}

function beep(ctx: AudioContext | null) {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = 880
  gain.gain.setValueAtTime(0.3, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
  osc.connect(gain).connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + 0.6)
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    padding: '0 16px 32px',
  },
  header: {
    padding: '24px 0 20px',
  },
  back: {
    fontSize: 14,
    color: 'var(--color-muted)',
    marginBottom: 12,
    display: 'block',
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
  },
  muted: {
    color: 'var(--color-muted)',
    fontSize: 14,
  },
  notice: {
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius)',
    padding: 20,
    boxShadow: 'var(--shadow)',
    textAlign: 'center',
  },
  setup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: 600,
  },
  addRow: {
    display: 'flex',
    gap: 8,
  },
  nameInput: {
    flex: 1,
    fontSize: 17,
    padding: '12px 14px',
    border: '2px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-surface)',
    outline: 'none',
  },
  addButton: {
    padding: '0 20px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-primary)',
    color: '#fff',
    fontWeight: 600,
  },
  playerList: {
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  playerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-sm)',
    padding: '10px 14px',
    boxShadow: 'var(--shadow)',
    fontSize: 17,
  },
  remove: {
    color: 'var(--color-muted)',
    fontSize: 16,
    padding: '4px 8px',
  },
  primary: {
    padding: '16px',
    borderRadius: 'var(--radius)',
    background: 'var(--color-primary)',
    color: '#fff',
    fontSize: 18,
    fontWeight: 600,
    width: '100%',
  },
  secondaryRow: {
    display: 'flex',
    gap: 10,
  },
  secondary: {
    flex: 1,
    padding: '14px',
    borderRadius: 'var(--radius)',
    border: '2px solid var(--color-border)',
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--color-muted)',
  },
  centre: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    textAlign: 'center',
  },
  lastTurn: {
    fontSize: 17,
    fontWeight: 600,
    color: 'var(--color-correct)',
    marginBottom: 24,
  },
  bigName: {
    fontSize: 40,
    fontWeight: 700,
    wordBreak: 'break-word',
  },
  rule: {
    margin: '24px 0',
    fontSize: 16,
  },
  endGame: {
    alignSelf: 'center',
    fontSize: 13,
    color: 'var(--color-muted)',
    textDecoration: 'underline',
    marginTop: 24,
  },
  turnPage: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    padding: '16px 16px 24px',
  },
  turnHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  turnPlayer: {
    fontSize: 16,
    fontWeight: 600,
  },
  timer: {
    fontSize: 36,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  timerLow: {
    color: 'var(--color-wrong)',
  },
  turnScore: {
    fontSize: 14,
    color: 'var(--color-muted)',
  },
  wordArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    textAlign: 'center',
  },
  timeUp: {
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--color-wrong)',
  },
  word: {
    fontSize: 40,
    fontWeight: 700,
    wordBreak: 'break-word',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow)',
    padding: '32px 20px',
    width: '100%',
  },
  undoRow: {
    minHeight: 40,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  undo: {
    fontSize: 14,
    color: 'var(--color-muted)',
    padding: '8px 12px',
  },
  // Far apart and tall, so a describer waving their hands doesn't hit the wrong one.
  answerRow: {
    display: 'flex',
    gap: 24,
  },
  skip: {
    flex: 1,
    padding: '28px 0',
    borderRadius: 'var(--radius)',
    background: 'var(--color-border)',
    fontSize: 20,
    fontWeight: 700,
    color: 'var(--color-text)',
  },
  gotIt: {
    flex: 1,
    padding: '28px 0',
    borderRadius: 'var(--radius)',
    background: 'var(--color-correct)',
    fontSize: 20,
    fontWeight: 700,
    color: '#fff',
  },
  scoreCard: {
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow)',
    padding: 24,
    textAlign: 'center',
  },
  score: {
    fontSize: 56,
    fontWeight: 700,
    color: 'var(--color-primary)',
    lineHeight: 1,
  },
  scoreLabel: {
    fontSize: 16,
    fontWeight: 600,
    margin: '8px 0 4px',
  },
  listCard: {
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow)',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  resultRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 16,
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    background: 'var(--color-bg)',
    borderRadius: 20,
    padding: '6px 12px',
    fontSize: 15,
  },
}
