import { useEffect, useState, useCallback, useRef, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import type { AuthedTutor } from '../types'
import { DAY_NAMES, formatFullDateLabel, formatTime, parseDateKey, toDateKey } from '../lib/dates'
import { Logo } from '../components/Logo'
import { IconLink, IconClock, IconUsers, IconCopy, IconCheck, IconLogout } from '../components/icons'
import { AdminPanel } from '../components/AdminPanel'

const TUTOR_ID_KEY = 'classlink_tutor_id'

interface BookingRow {
  id: string
  booking_date: string
  status: string
  students: { name: string; contact: string } | null
  time_slots: { day_of_week: number; start_time: string; end_time: string } | null
}

function LoginForm({ onSuccess }: { onSuccess: (tutor: AuthedTutor) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (!username.trim() || !password) {
      setError('Enter your username and password.')
      return
    }

    setSubmitting(true)
    const { data, error: queryError } = await supabase
      .from('tutors')
      .select('id, name, subject, contact, is_admin')
      .eq('username', username.trim())
      .eq('password', password)
      .maybeSingle()
    setSubmitting(false)

    if (queryError || !data) {
      setError('Incorrect username or password.')
      return
    }

    sessionStorage.setItem(TUTOR_ID_KEY, data.id)
    onSuccess(data as AuthedTutor)
  }

  return (
    <div className="auth-bg">
      <div className="glow-blob blob-1" />
      <div className="glow-blob blob-2" />
      <div className="card fade-slide-in" style={{ maxWidth: 380, width: '100%', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <Logo size={44} showText={false} />
        </div>
        <h1>ClassLink</h1>
        <p className="muted" style={{ marginBottom: 20 }}>
          Log in to your account
        </p>
        <form onSubmit={handleSubmit} style={{ textAlign: 'left' }}>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn" disabled={submitting} style={{ width: '100%', justifyContent: 'center' }}>
            {submitting ? 'Logging in...' : 'Log in'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function Admin() {
  const navigate = useNavigate()
  const location = useLocation()
  const [tutorId, setTutorId] = useState<string | null>(() => sessionStorage.getItem(TUTOR_ID_KEY))
  const [tutor, setTutor] = useState<AuthedTutor | null>(null)
  const [resolving, setResolving] = useState(!!tutorId)

  useEffect(() => {
    if (!tutor) return
    const targetPath = tutor.is_admin ? '/admin-panel' : '/dashboard'
    if (location.pathname !== targetPath) {
      navigate(targetPath, { replace: true })
    }
  }, [tutor, location.pathname, navigate])

  useEffect(() => {
    if (!tutorId) return
    let cancelled = false

    async function loadTutor(id: string) {
      setResolving(true)
      const { data } = await supabase
        .from('tutors')
        .select('id, name, subject, contact, is_admin')
        .eq('id', id)
        .maybeSingle()

      if (cancelled) return
      if (!data) {
        sessionStorage.removeItem(TUTOR_ID_KEY)
        setTutorId(null)
        setTutor(null)
      } else {
        setTutor(data as AuthedTutor)
      }
      setResolving(false)
    }

    loadTutor(tutorId)
    return () => {
      cancelled = true
    }
  }, [tutorId])

  function handleLogout() {
    sessionStorage.removeItem(TUTOR_ID_KEY)
    window.location.href = '/login'
  }

  if (!tutorId) {
    return (
      <LoginForm
        onSuccess={(loggedInTutor) => {
          setTutorId(loggedInTutor.id)
          setTutor(loggedInTutor)
        }}
      />
    )
  }

  if (resolving || !tutor) {
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

  return <Dashboard tutor={tutor} onLogout={handleLogout} />
}

function Dashboard({ tutor, onLogout }: { tutor: AuthedTutor; onLogout: () => void }) {
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

  const loadBookings = useCallback(async (tutorId: string) => {
    setBookingsLoading(true)
    const today = toDateKey(new Date())
    const { data } = await supabase
      .from('bookings')
      .select('id, booking_date, status, students(name, contact), time_slots(day_of_week, start_time, end_time)')
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
    if (tutor.is_admin) return

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
  }, [tutor.id, tutor.is_admin, loadBookings])

  async function handleAddSlot(e: FormEvent) {
    e.preventDefault()
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

  const bookingLink = `${window.location.origin}/book/${tutor.id}`

  function copyLink() {
    navigator.clipboard.writeText(bookingLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="app-bg">
      <div className="glow-blob blob-1 fixed" />
      <div className="glow-blob blob-2 fixed" />
      <div className="page stagger-parent">
        <div className="topbar">
          <Logo />
          <button className="btn btn-outline" onClick={onLogout}>
            <IconLogout size={15} />
            Log out
          </button>
        </div>
        <p className="muted" style={{ marginBottom: 24 }}>
          Welcome, {tutor.name}
        </p>

        {tutor.is_admin ? (
          <AdminPanel />
        ) : (
          <>
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
                        <strong>
                          {b.students?.name ?? 'Unknown student'}
                          {b.students?.contact ? ` - ${b.students.contact}` : ''}
                        </strong>
                        <div className="muted">
                          {formatFullDateLabel(parseDateKey(b.booking_date))}
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
          </>
        )}
      </div>
    </div>
  )
}
