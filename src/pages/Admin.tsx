import { useEffect, useState, useCallback, useRef, type FormEvent } from 'react'
import { supabase } from '../supabaseClient'
import type { Tutor } from '../types'
import { DAY_NAMES, formatTime, toDateKey } from '../lib/dates'
import { Logo } from '../components/Logo'
import { IconLink, IconClock, IconUsers, IconCopy, IconCheck, IconLogout } from '../components/icons'

const AUTH_KEY = 'classlink_admin_auth'
const TUTOR_PASSWORD = import.meta.env.VITE_TUTOR_PASSWORD
// TEMPORARY DEBUG — remove once the login mismatch is diagnosed. Logs length only, never the value.
console.log('[DEBUG] VITE_TUTOR_PASSWORD length at load:', TUTOR_PASSWORD?.length)

interface BookingRow {
  id: string
  booking_date: string
  status: string
  students: { name: string } | null
  time_slots: { day_of_week: number; start_time: string; end_time: string } | null
}

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // TEMPORARY DEBUG — remove once the login mismatch is diagnosed. Logs lengths/match only, never the values.
    console.log('[DEBUG] entered password length:', password.length, '| expected password length:', TUTOR_PASSWORD?.length)
    console.log('[DEBUG] passwords match:', password === TUTOR_PASSWORD)
    if (password === TUTOR_PASSWORD) {
      sessionStorage.setItem(AUTH_KEY, 'true')
      onSuccess()
    } else {
      setError('Incorrect password.')
    }
  }

  return (
    <div className="auth-bg">
      <div className="glow-blob blob-1" />
      <div className="glow-blob blob-2" />
      <div className="card fade-slide-in" style={{ maxWidth: 380, width: '100%', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <Logo size={44} showText={false} />
        </div>
        <h1>ClassLink Admin</h1>
        <p className="muted" style={{ marginBottom: 20 }}>
          Enter the tutor password to continue.
        </p>
        <form onSubmit={handleSubmit} style={{ textAlign: 'left' }}>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn" style={{ width: '100%', justifyContent: 'center' }}>
            Log in
          </button>
        </form>
      </div>
    </div>
  )
}

export default function Admin() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(AUTH_KEY) === 'true')

  if (!authed) {
    return <LoginForm onSuccess={() => setAuthed(true)} />
  }

  return <Dashboard />
}

function Dashboard() {
  const [tutor, setTutor] = useState<Tutor | null>(null)
  const [tutorLoading, setTutorLoading] = useState(true)
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [bookingsLoading, setBookingsLoading] = useState(true)
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set())
  const [headerPulse, setHeaderPulse] = useState(false)
  const knownBookingIds = useRef<Set<string>>(new Set())
  const firstBookingsLoad = useRef(true)
  const isMounted = useRef(true)

  useEffect(() => {
    return () => {
      isMounted.current = false
    }
  }, [])

  const [dayOfWeek, setDayOfWeek] = useState('1')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [slotError, setSlotError] = useState('')
  const [slotSaving, setSlotSaving] = useState(false)
  const [slotSuccess, setSlotSuccess] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function loadTutor() {
      setTutorLoading(true)
      const { data } = await supabase
        .from('tutors')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      setTutor(data)
      setTutorLoading(false)
    }
    loadTutor()
  }, [])

  const loadBookings = useCallback(async (tutorId: string) => {
    setBookingsLoading(true)
    const today = toDateKey(new Date())
    const { data } = await supabase
      .from('bookings')
      .select('id, booking_date, status, students(name), time_slots(day_of_week, start_time, end_time)')
      .eq('tutor_id', tutorId)
      .gte('booking_date', today)
      .order('booking_date', { ascending: true })
    const rows = (data as unknown as BookingRow[]) ?? []

    if (firstBookingsLoad.current) {
      firstBookingsLoad.current = false
    } else {
      const newlyArrivedIds = rows
        .filter((r) => !knownBookingIds.current.has(r.id))
        .map((r) => r.id)
      if (newlyArrivedIds.length > 0 && isMounted.current) {
        setHighlightIds(new Set(newlyArrivedIds))
        setHeaderPulse(true)
        setTimeout(() => {
          if (isMounted.current) setHighlightIds(new Set())
        }, 2000)
        setTimeout(() => {
          if (isMounted.current) setHeaderPulse(false)
        }, 700)
      }
    }
    knownBookingIds.current = new Set(rows.map((r) => r.id))

    setBookings(rows)
    setBookingsLoading(false)
  }, [])

  useEffect(() => {
    if (!tutor) return
    loadBookings(tutor.id)

    const channel = supabase
      .channel(`bookings-admin-${tutor.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `tutor_id=eq.${tutor.id}` },
        () => loadBookings(tutor.id),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tutor, loadBookings])

  async function handleAddSlot(e: FormEvent) {
    e.preventDefault()
    if (!tutor) return
    setSlotError('')
    setSlotSuccess(false)

    if (startTime >= endTime) {
      setSlotError('End time must be after start time.')
      return
    }

    setSlotSaving(true)
    const { error } = await supabase.from('time_slots').insert({
      tutor_id: tutor.id,
      day_of_week: Number(dayOfWeek),
      start_time: startTime,
      end_time: endTime,
      is_recurring: true,
    })
    setSlotSaving(false)

    if (error) {
      setSlotError(error.message)
    } else {
      setSlotSuccess(true)
    }
  }

  function handleLogout() {
    sessionStorage.removeItem(AUTH_KEY)
    window.location.reload()
  }

  const bookingLink = tutor ? `${window.location.origin}/book/${tutor.id}` : ''

  function copyLink() {
    if (!bookingLink) return
    navigator.clipboard.writeText(bookingLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (tutorLoading) {
    return (
      <div className="app-bg">
        <div className="glow-blob blob-1 fixed" />
        <div className="glow-blob blob-2 fixed" />
        <div className="page">
          <div className="topbar">
            <Logo />
          </div>
          <p className="muted">Loading...</p>
        </div>
      </div>
    )
  }

  if (!tutor) {
    return (
      <div className="app-bg">
        <div className="glow-blob blob-1 fixed" />
        <div className="glow-blob blob-2 fixed" />
        <div className="page">
          <div className="topbar">
            <Logo />
          </div>
          <div className="card fade-slide-in">
            <h1>No tutor profile found</h1>
            <p className="muted">
              Add a row to the <code>tutors</code> table in Supabase to get started.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-bg">
      <div className="glow-blob blob-1 fixed" />
      <div className="glow-blob blob-2 fixed" />
      <div className="page stagger-parent">
        <div className="topbar">
          <Logo />
          <button className="btn btn-outline" onClick={handleLogout}>
            <IconLogout size={15} />
            Log out
          </button>
        </div>
        <p className="muted" style={{ marginBottom: 24 }}>
          Welcome, {tutor.name}
        </p>

        <div className="card">
          <div className="card-title">
            <span className="icon-badge">
              <IconLink size={17} />
            </span>
            <h2>Your booking link</h2>
          </div>
          <p className="muted">Share this link with students so they can book a session.</p>
          <div className="link-box">
            <input readOnly value={bookingLink} onFocus={(e) => e.target.select()} />
            <button className="btn" onClick={copyLink}>
              <IconCopy size={15} />
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <span className="icon-badge">
              <IconClock size={17} />
            </span>
            <h2>Add a weekly time slot</h2>
          </div>
          <form onSubmit={handleAddSlot} style={{ marginTop: 18 }}>
            <div className="row">
              <div className="field">
                <label htmlFor="day">Day of week</label>
                <select id="day" value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)}>
                  {DAY_NAMES.map((name, idx) => (
                    <option key={idx} value={idx}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="start">Start time</label>
                <input
                  id="start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="end">End time</label>
                <input
                  id="end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
            {slotError && <p className="error">{slotError}</p>}
            {slotSuccess && (
              <p
                className="slot-success-msg"
                style={{ color: 'var(--success)', fontSize: 14, display: 'flex', alignItems: 'center' }}
              >
                <span className="confetti-wrap">
                  <span className="check-badge">
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="4 12 9 17 20 6" />
                    </svg>
                  </span>
                  <span className="confetti-dot" />
                  <span className="confetti-dot" />
                  <span className="confetti-dot" />
                  <span className="confetti-dot" />
                  <span className="confetti-dot" />
                  <span className="confetti-dot" />
                </span>
                Slot added!
              </p>
            )}
            <button type="submit" className="btn" disabled={slotSaving}>
              {slotSaving ? 'Adding...' : 'Add slot'}
            </button>
          </form>
        </div>

        <div className="card">
          <div className="card-title">
            <span className="icon-badge">
              <IconUsers size={17} />
            </span>
            <h2>
              <span className={headerPulse ? 'pulse-header' : undefined}>Upcoming bookings</span>
            </h2>
          </div>
          <div style={{ marginTop: 16 }}>
            {bookingsLoading ? (
              <p className="muted">Loading...</p>
            ) : bookings.length === 0 ? (
              <p className="muted">No upcoming bookings yet.</p>
            ) : (
              bookings.map((b) => (
                <div
                  className={highlightIds.has(b.id) ? 'booking-item is-new' : 'booking-item'}
                  key={b.id}
                >
                  <div>
                    <strong>{b.students?.name ?? 'Unknown student'}</strong>
                    <div className="muted">
                      {b.booking_date}
                      {b.time_slots
                        ? ` · ${formatTime(b.time_slots.start_time)} - ${formatTime(b.time_slots.end_time)}`
                        : ''}
                    </div>
                  </div>
                  <span className="pill pill-success">
                    <IconCheck size={11} />
                    {b.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}