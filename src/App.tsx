import { useMemo, useRef, useState } from 'react'
import questionData from './data/questions.json'
import './App.css'

type Question = {
  id: string
  text: string
  options: string[]
  answers: number[]
  section: string
}

type RawRecord = Record<string, unknown>

const STORAGE_KEY = 'learnloop-quiz-data-v2'
const PROGRESS_KEY = 'learnloop-quiz-progress-v2'
const ALL_QUESTIONS_LABEL = 'Všechny otázky'
const bundledQuestions = normalizeQuestions(questionData)

function readSavedQuestions(): Question[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) as Question[] : bundledQuestions
  } catch {
    return bundledQuestions
  }
}

function asRecord(value: unknown): RawRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RawRecord : null
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number') return String(value)
  return undefined
}

function normalizeQuestions(input: unknown): Question[] {
  let source: unknown = input
  const wrapper = asRecord(source)
  if (wrapper) {
    source = wrapper.questions ?? wrapper.items ?? wrapper.results ?? wrapper.data ?? wrapper.quiz ?? source
    if (asRecord(source)) {
      const nested = asRecord(source)
      source = nested?.questions ?? nested?.items ?? nested?.results ?? source
    }
  }
  const rows = Array.isArray(source) ? source : asRecord(source) ? [source] : []

  return rows.flatMap((row, index) => {
    const item = asRecord(row)
    if (!item) return []
    const text = stringValue(item.question ?? item.text ?? item.prompt ?? item.title)
    const rawOptions = item.options ?? item.choices ?? item.answers ?? item.variants
    if (!text || (!Array.isArray(rawOptions) && !asRecord(rawOptions))) return []

    const entries = Array.isArray(rawOptions) ? rawOptions.map((choice, choiceIndex) => [String(choiceIndex), choice] as const) : Object.entries(rawOptions as RawRecord)
    const optionLabels = entries.map(([key, choice]) => {
      const record = asRecord(choice)
      return stringValue(record?.text ?? record?.label ?? record?.value ?? record?.answer) ?? stringValue(choice) ?? key
    })
    if (optionLabels.length < 2) return []

    const markedIndices = entries.flatMap(([, choice], choiceIndex) => asRecord(choice)?.isCorrect === true || asRecord(choice)?.correct === true ? [choiceIndex] : [])
    const directIndex = item.correctIndex ?? item.correct_index ?? item.answerIndex ?? item.answer_index
    const candidate = item.correctAnswer ?? item.correct_answer ?? item.correctOption ?? item.correct_option ?? item.answer ?? item.correct
    let answers = markedIndices
    const directAnswers = Array.isArray(directIndex) ? directIndex : directIndex === undefined ? [] : [directIndex]
    const candidateAnswers = Array.isArray(candidate) ? candidate : candidate === undefined ? [] : [candidate]
    const explicitAnswers = directAnswers.length ? directAnswers : candidateAnswers
    if (explicitAnswers.length) {
      answers = explicitAnswers.flatMap((value) => {
        if (typeof value === 'number' && Number.isInteger(value)) return [value]
        if (typeof value !== 'string') return []
        const normalized = value.trim().toLocaleLowerCase()
        const textIndex = optionLabels.findIndex((option) => option.trim().toLocaleLowerCase() === normalized)
        const letterIndex = /^[a-z]$/i.test(normalized) ? normalized.toUpperCase().charCodeAt(0) - 65 : -1
        if (textIndex >= 0) return [textIndex]
        if (letterIndex >= 0 && letterIndex < optionLabels.length) return [letterIndex]
        return []
      })
    }
    answers = [...new Set(answers)].filter((answer) => answer >= 0 && answer < optionLabels.length)
    if (answers.length === 0) return []

    const explicitSection = stringValue(item.section ?? item.category ?? item.topic ?? item.subject ?? item.group)
    const haystack = `${text} ${optionLabels.join(' ')}`.toLocaleLowerCase()
    const section = explicitSection ?? inferSection(haystack)
    return [{ id: stringValue(item.id ?? item._id) ?? `import-${index}-${text.slice(0, 24)}`, text, options: optionLabels, answers, section }]
  })
}

function inferSection(text: string): string {
  const topics: Array<[string, RegExp]> = [
    ['Normalizace a klíče', /(normal form|normaliz|normalis|functional dependency|transitive dependency|candidate uid|primary uid|secondary uid)/i],
    ['Čas a historie dat', /(historical data|history of|logging|journaling|time component|modeling time|modeling historical|date attribute|start date|end date)/i],
    ['Fyzický model a SQL', /(physical (data )?model|foreign key|primary key|column integrity|entity integrity|referential integrity|user-defined integrity|intersection table|oracle database|sql |sql\b|relational database)/i],
    ['Pokročilé vztahy a omezení', /(supertype|subtype|recursive relationship|hierarchical relationship|\barc\b|exclusive or|exclusivity|constraint type|business rule)/i],
    ['Vztahy mezi entitami', /(relationship|cardinality|optionality|transferable|one-to-one|one to one|one-to-many|one to many|many-to-many|many to many|m:m|redundant relationship|intersection entit)/i],
    ['Základy ER modelování', /(\berd\b|entity|entities|attribute|unique identifier|\buid\b|conceptual model|data model|data modeling)/i],
    ['Databáze a práce s daty', /(database|querying|information|\bdata\b|search engine|transaction|business application)/i],
    ['Informační systémy a IT', /(system development|software|hardware|internet|\bit professional|computer system|business needs|computing|users?)/i],
  ]
  return topics.find(([, pattern]) => pattern.test(text))?.[0] ?? 'Ostatní témata'
}

function App() {
  const [questions, setQuestions] = useState<Question[]>(readSavedQuestions)
  const [answers, setAnswers] = useState<Record<string, number[]>>(() => {
    try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '{}') as Record<string, number[]> } catch { return {} }
  })
  const [activeSection, setActiveSection] = useState(ALL_QUESTIONS_LABEL)
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [examQuestions, setExamQuestions] = useState<Question[] | null>(null)
  const [examAnswers, setExamAnswers] = useState<Record<string, number[]>>({})
  const [examIndex, setExamIndex] = useState(0)
  const [examFinished, setExamFinished] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const sections = useMemo(() => [...new Set(questions.map((question) => question.section))], [questions])
  const visibleQuestions = useMemo(() => questions.filter((question) => {
    const inSection = activeSection === ALL_QUESTIONS_LABEL || question.section === activeSection
    const query = search.trim().toLocaleLowerCase()
    return inSection && (!query || `${question.text} ${question.options.join(' ')}`.toLocaleLowerCase().includes(query))
  }), [questions, activeSection, search])
  const isCorrect = (question: Question, selected: number[] = answers[question.id] ?? []) => selected.length === question.answers.length && question.answers.every((answer) => selected.includes(answer))
  const correctCount = questions.filter((question) => isCorrect(question)).length
  const percentage = questions.length ? Math.round((correctCount / questions.length) * 100) : 0

  function saveProgress(next: Record<string, number[]>) {
    setAnswers(next)
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(next))
  }

  function chooseAnswer(question: Question, optionIndex: number) {
    const selected = answers[question.id] ?? []
    if (selected.length >= question.answers.length) return
    const nextSelection = selected.includes(optionIndex) ? selected.filter((index) => index !== optionIndex) : [...selected, optionIndex]
    saveProgress({ ...answers, [question.id]: nextSelection })
  }

  function startExam() {
    const shuffled = [...questions]
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1))
      const question = shuffled[index]
      shuffled[index] = shuffled[randomIndex]
      shuffled[randomIndex] = question
    }
    const selectedQuestions = shuffled.slice(0, 50)
    if (selectedQuestions.length === 0) {
      setNotice('Nejprve načtěte otázky, abyste mohli spustit test.')
      return
    }
    setExamQuestions(selectedQuestions)
    setExamAnswers({})
    setExamIndex(0)
    setExamFinished(false)
    setNotice('')
  }

  function chooseExamAnswer(question: Question, optionIndex: number) {
    const selected = examAnswers[question.id] ?? []
    const nextSelection = selected.includes(optionIndex)
      ? selected.filter((index) => index !== optionIndex)
      : selected.length < question.answers.length ? [...selected, optionIndex] : selected
    setExamAnswers({ ...examAnswers, [question.id]: nextSelection })
  }

  function endExam() {
    setExamFinished(true)
  }

  function leaveExam() {
    setExamQuestions(null)
    setExamAnswers({})
    setExamIndex(0)
    setExamFinished(false)
  }

  async function importFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const parsed: unknown = JSON.parse(await file.text())
      const imported = normalizeQuestions(parsed)
      if (imported.length === 0) throw new Error('V souboru nebyly nalezeny otázky s možnostmi a správnými odpověďmi. Zkontrolujte strukturu JSON.')
      setQuestions(imported)
      setAnswers({})
      leaveExam()
      localStorage.setItem(STORAGE_KEY, JSON.stringify(imported))
      localStorage.removeItem(PROGRESS_KEY)
      setActiveSection(ALL_QUESTIONS_LABEL)
      setSearch('')
      setNotice(`Hotovo! Načteno ${imported.length} ${questionWord(imported.length)}.`)
    } catch (error) {
      setNotice(error instanceof SyntaxError ? 'Soubor JSON se nepodařilo přečíst. Zkontrolujte jeho formát.' : error instanceof Error ? error.message : 'Soubor se nepodařilo načíst.')
    } finally {
      event.target.value = ''
    }
  }

  function resetProgress() {
    saveProgress({})
    setNotice('Pokrok byl vynulován. Můžete začít znovu.')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Uč se — domů"><span className="brand-mark">u</span><span>uč se<span className="brand-dot">.</span></span></a>
        <div className="topbar-center"><span className="status-dot" /> VAŠE OSOBNÍ KNIHOVNA ZNALOSTÍ</div>
        <button className="top-upload" onClick={() => fileInput.current?.click()}><span aria-hidden="true">＋</span> Načíst JSON</button>
        <input ref={fileInput} className="visually-hidden" type="file" accept=".json,application/json" onChange={importFile} />
      </header>

      <main id="top" className="layout">
        <aside className="sidebar">
          <div className="side-label">MOJE KNIHOVNA</div>
          <button className={`nav-item ${activeSection === ALL_QUESTIONS_LABEL ? 'active' : ''}`} onClick={() => setActiveSection(ALL_QUESTIONS_LABEL)}>
            <span className="nav-icon">▦</span><span>Všechny otázky</span><span className="nav-count">{questions.length}</span>
          </button>
          <div className="side-label section-label">TÉMATA <span>{sections.length}</span></div>
          <nav className="section-nav" aria-label="Tematické části">
            {sections.map((section, index) => (
              <button key={section} className={`nav-item ${activeSection === section ? 'active' : ''}`} onClick={() => setActiveSection(section)}>
                <span className={`section-marker marker-${index % 5}`} /><span className="nav-title">{section}</span><span className="nav-count">{questions.filter((q) => q.section === section).length}</span>
              </button>
            ))}
          </nav>

          <div className="sidebar-bottom">
            <div className="streak-card">
              <div className="streak-icon">✦</div>
              <div><strong>Malé kroky</strong><p>každý den přináší velký pokrok</p></div>
            </div>
            <button className="reset-button" onClick={resetProgress}>↺ <span>Vynulovat pokrok</span></button>
          </div>
        </aside>

        <section className="content">
          <div className="welcome-row">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> PROSTOR PRO VÁŠ RŮST</div>
              <h1>Učení může být <span>radost.</span></h1>
              <p className="intro">Vaše tempo, vaše otázky, váš pokrok. Začněte jednou odpovědí.</p>
            </div>
            <div className="welcome-actions">
              <button className="exam-start-button" onClick={startExam}><span aria-hidden="true">✦</span> Náhodný test 50 otázek</button>
              <div className="progress-card" aria-label={`Správně ${correctCount} z ${questions.length} otázek`}>
                <div className="progress-ring" style={{ '--progress': `${percentage}%` } as React.CSSProperties}><span>{percentage}<small>%</small></span></div>
                <div><strong>Váš pokrok</strong><p>{correctCount} z {questions.length} správně</p></div>
              </div>
            </div>
          </div>

          {notice && <div className="notice" role="status"><span>✦</span>{notice}<button onClick={() => setNotice('')} aria-label="Zavřít oznámení">×</button></div>}

          {examQuestions ? examFinished ? (() => {
            const examCorrectCount = examQuestions.filter((question) => isCorrect(question, examAnswers[question.id] ?? [])).length
            const examPercentage = Math.round((examCorrectCount / examQuestions.length) * 100)
            const incorrectQuestions = examQuestions.filter((question) => !isCorrect(question, examAnswers[question.id] ?? []))
            return <section className="exam-results" aria-labelledby="exam-result-title">
              <div className="exam-result-icon">{examPercentage >= 70 ? '✦' : '↗'}</div>
              <div className="eyebrow">TEST DOKONČEN</div>
              <h2 id="exam-result-title">Výsledek je tady</h2>
              <p className="exam-result-score">{examPercentage}<span>%</span></p>
              <p className="exam-result-summary">Správně {examCorrectCount} z {examQuestions.length} {questionWord(examQuestions.length)}. {examPercentage >= 70 ? 'Skvělá práce!' : 'Každý test je příležitost posunout se dál.'}</p>
              {incorrectQuestions.length > 0 ? <div className="exam-review">
                <h3>Otázky k zopakování <span>{incorrectQuestions.length}</span></h3>
                <div className="exam-review-list">
                  {incorrectQuestions.map((question, index) => <article className="exam-review-card" key={question.id}>
                    <div className="question-meta"><span className="question-number">CHYBA {String(index + 1).padStart(2, '0')}</span><span className="topic-chip">{question.section}</span></div>
                    <h4>{question.text}</h4>
                    <p className="exam-review-label">Správná odpověď{question.answers.length > 1 ? 'i' : ''}</p>
                    <ul>{question.answers.map((answer) => <li key={answer}>{question.options[answer]}</li>)}</ul>
                  </article>)}
                </div>
              </div> : <div className="exam-perfect"><span>✓</span> Bez jediné chyby — všechno správně!</div>}
              <div className="exam-actions"><button className="exam-start-button" onClick={startExam}>Zkusit nový test <span aria-hidden="true">↻</span></button><button className="exam-secondary-button" onClick={leaveExam}>Zpět k procvičování</button></div>
            </section>
          })() : (() => {
            const question = examQuestions[examIndex]
            const selected = examAnswers[question.id] ?? []
            const progress = ((examIndex + 1) / examQuestions.length) * 100
            return <section className="exam-panel" aria-label="Náhodný test">
              <div className="exam-panel-header">
                <div><div className="eyebrow"><span className="eyebrow-line" /> TEST BEZ NÁPOVĚDY</div><h2>Náhodný test</h2></div>
                <button className="exam-exit-button" onClick={leaveExam}>Ukončit test</button>
              </div>
              <div className="exam-progress-row"><span>Otázka {examIndex + 1} z {examQuestions.length}</span><span>{Math.round(progress)} %</span></div>
              <div className="exam-progress-track" role="progressbar" aria-label="Průběh testu" aria-valuemin={0} aria-valuemax={examQuestions.length} aria-valuenow={examIndex + 1}><span style={{ width: `${progress}%` }} /></div>
              <article className="question-card exam-question">
                <div className="question-meta"><span className="question-number">OTÁZKA {String(examIndex + 1).padStart(2, '0')}</span><span className="topic-chip">{question.section}</span></div>
                <h3>{question.text}</h3>
                {question.answers.length > 1 && <p className="multi-hint">Vyberte {question.answers.length} správné odpovědi ({selected.length}/{question.answers.length})</p>}
                <div className="answers-grid">
                  {question.options.map((option, optionIndex) => <button key={`${question.id}-${optionIndex}`} className={`answer-option ${selected.includes(optionIndex) ? 'selected' : ''}`} onClick={() => chooseExamAnswer(question, optionIndex)} aria-pressed={selected.includes(optionIndex)}>
                    <span className="option-letter">{String.fromCharCode(65 + optionIndex)}</span><span className="option-text">{option}</span>
                  </button>)}
                </div>
              </article>
              <div className="exam-navigation">
                <button className="exam-secondary-button" onClick={() => setExamIndex(examIndex - 1)} disabled={examIndex === 0}>← Předchozí</button>
                <span>{selected.length === question.answers.length ? 'Odpověď zaznamenána' : `Vyberte ${question.answers.length} ${question.answers.length === 1 ? 'odpověď' : 'odpovědi'}`}</span>
                {examIndex < examQuestions.length - 1
                  ? <button className="exam-start-button" onClick={() => setExamIndex(examIndex + 1)} disabled={selected.length !== question.answers.length}>Další otázka <span aria-hidden="true">→</span></button>
                  : <button className="exam-start-button" onClick={endExam} disabled={selected.length !== question.answers.length}>Dokončit test <span aria-hidden="true">✓</span></button>}
              </div>
            </section>
          })() : <>
          <div className="toolbar">
            <div className="list-heading"><div><span className="eyebrow">VAŠE PROCVIČOVÁNÍ</span><h2>{activeSection === ALL_QUESTIONS_LABEL ? ALL_QUESTIONS_LABEL : activeSection}</h2></div><span className="question-total">{visibleQuestions.length} {questionWord(visibleQuestions.length)}</span></div>
            <label className="search-box"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Hledat otázku…" aria-label="Hledat otázky" />{search && <button onClick={() => setSearch('')} aria-label="Vymazat hledání">×</button>}</label>
          </div>

          {questions.length === 0 ? <div className="empty-state"><span>✧</span><h3>Zatím tu nic není</h3><p>Načtěte JSON s otázkami a rozdělíme je do tematických částí.</p></div> : visibleQuestions.length === 0 ? <div className="empty-state"><span>⌕</span><h3>Nic jsme nenašli</h3><p>Zkuste jiné slovo nebo vyberte jiné téma.</p></div> : (
            <div className="question-list">
              {visibleQuestions.map((question) => {
                const selected = answers[question.id] ?? []
                const isAnswered = selected.length === question.answers.length
                const correctResponse = isCorrect(question, selected)
                return <article className="question-card" key={question.id}>
                  <div className="question-meta"><span className="question-number">OTÁZKA {String(questions.indexOf(question) + 1).padStart(2, '0')}</span><span className="topic-chip">{question.section}</span>{isAnswered && <span className={`answer-status ${correctResponse ? 'is-correct' : 'is-wrong'}`}>{correctResponse ? '✓ Správně' : '× Nesprávně'}</span>}</div>
                  <h3>{question.text}</h3>
                  {question.answers.length > 1 && <p className="multi-hint">Vyberte {question.answers.length} správné odpovědi ({selected.length}/{question.answers.length})</p>}
                  <div className="answers-grid">
                    {question.options.map((option, optionIndex) => {
                      const correct = isAnswered && question.answers.includes(optionIndex)
                      const wrong = isAnswered && selected.includes(optionIndex) && !question.answers.includes(optionIndex)
                      return <button key={`${question.id}-${optionIndex}`} className={`answer-option ${correct ? 'correct' : ''} ${wrong ? 'wrong' : ''} ${selected.includes(optionIndex) && !isAnswered ? 'selected' : ''}`} onClick={() => chooseAnswer(question, optionIndex)} aria-pressed={selected.includes(optionIndex)} disabled={isAnswered}>
                        <span className="option-letter">{String.fromCharCode(65 + optionIndex)}</span><span className="option-text">{option}</span>{correct && <span className="option-result">✓</span>}{wrong && <span className="option-result">×</span>}
                      </button>
                    })}
                  </div>
                  {isAnswered && <div className={`feedback ${correctResponse ? 'feedback-good' : 'feedback-try'}`}><span>{correctResponse ? '✦' : '↗'}</span>{correctResponse ? 'Výborně! Jen tak dál.' : 'Tentokrát to nevyšlo. Správné odpovědi jsou označeny zeleně.'}</div>}
                </article>
              })}
            </div>
          )}
          </>}
          <footer className="page-footer"><span>Vytvořeno pro klidné učení</span><span className="footer-sparkle">✳</span></footer>
        </section>
      </main>
    </div>
  )
}

function questionWord(count: number) {
  return count === 1 ? 'otázka' : count >= 2 && count <= 4 ? 'otázky' : 'otázek'
}

export default App
