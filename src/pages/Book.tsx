import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import type { Tutor, TimeSlot } from '../types'
import { formatDateLabel, formatTime, toDateKey } from '../lib/dates'

const DAYS_AHEAD = 14

interface AvailableSlot {
  dateKey: string
  dateLabel: string
  slot: TimeSlot
}

export default function Book() {
  const { tutorId } = useParams<{ tutorId: string }>()
  const [tutor, setTutor] = useState<Tutor | null | undefined>(undefined)
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([])
  const [loading, setLoading] = useState(true)

  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [booked, setBooked] = useState<{ dateLabel: string; slot: TimeSlot } | null>(null)

  const loadAvailability = useCallback(async () => {
    if (!tutorId) return
    setLoading(true)

    const [{ data: tutorData }, { data: slotsData }] = await Promise.all([
      supabase.from('tutors').select('*').eq('id', tutorId).maybeSingle(),
      supabase.from('time_slots').select('*').eq('tutor_id', tutorId).eq('is_recurring', true),
    ])
    setTutor(tutorData ?? null)

    if (!tutorData || !slotsData) {
      setAvailableSlots([])
      setLoading(false)
      return
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const rangeStart = toDateKey(today)
    const rangeEnd = new Date(today)
    rangeEnd.setDate(rangeEnd.getDate() + DAYS_AHEAD - 1)

    const { data: bookingsData } = await supabase
      .from('bookings')
      .select('slot_id, booking_date')
      .eq('tutor_id', tutorId)
      .gte('booking_date', rangeStart)
      .lte('booking_date', toDateKey(rangeEnd))

    const bookedKeys = new Set((bookingsData ?? []).map((b) => `${b.slot_id}_${b.booking_date}`))

    const slots: AvailableSlot[] = []
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const date = new Date(today)
      date.setDate(date.getDate() + i)
      const dateKey = toDateKey(date)
      const dayOfWeek = date.getDay()

      const dayMatches = (slotsData as TimeSlot[]).filter((s) => s.day_of_week === dayOfWeek)
      for (const slot of dayMatches) {
        if (!bookedKeys.has(`${slot.id}_${dateKey}`)) {
          slots.push({ dateKey, dateLabel: formatDateLabel(date), slot })
        }
      }
    }
    slots.sort((a, b) => {
      if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey)
      return a.slot.start_time.localeCompare(b.slot.start_time)
    })

    setAvailableSlots(slots)
    setLoading(false)
  }, [tutorId])

  useEffect(() => {
    loadAvailability()
  }, [loadAvailability])

  async function handleBookSlot(available: AvailableSlot) {
    if (!tutorId) return
    setFormError('')

    if (!name.trim() || !contact.trim()) {
      setFormError('Please enter your name and contact info first.')
      return
    }

    setSubmitting(true)

    let studentId: string | null = null
    const { data: existingStudent } = await supabase
      .from('students')
      .select('id')
      .eq('tutor_id', tutorId)
      .eq('contact', contact.trim())
      .maybeSingle()

    if (existingStudent) {
      studentId = existingStudent.id
    } else {
      const { data: newStudent, error: studentError } = await supabase
        .from('students')
        .insert({ tutor_id: tutorId, name: name.trim(), contact: contact.trim() })
        .select('id')
        .single()

      if (studentError || !newStudent) {
        setFormError('Could not save your details. Please try again.')
        setSubmitting(false)
        return
      }
      studentId = newStudent.id
    }

    const { error: bookingError } = await supabase.from('bookings').insert({
      student_id: studentId,
      tutor_id: tutorId,
      slot_id: available.slot.id,
      booking_date: available.dateKey,
      status: 'confirmed',
    })

    setSubmitting(false)

    if (bookingError) {
      setFormError('That slot was just booked by someone else. Please pick another.')
      loadAvailability()
      return
    }

    setBooked({ dateLabel: available.dateLabel, slot: available.slot })
  }

  if (loading) {
    return (
      <div className="page">
        <p className="muted">Loading...</p>
      </div>
    )
  }

  if (tutor === null) {
    return (
      <div className="page">
        <div className="card">
          <h1>Tutor not found</h1>
          <p className="muted">This booking link is invalid.</p>
        </div>
      </div>
    )
  }

  if (booked) {
    return (
      <div className="page">
        <div className="card" style={{ textAlign: 'center' }}>
          <h1>Booked!</h1>
          <p>
            You're confirmed with {tutor?.name} on <strong>{booked.dateLabel}</strong> at{' '}
            <strong>{formatTime(booked.slot.start_time)}</strong>.
          </p>
        </div>
      </div>
    )
  }

  const slotsByDate = availableSlots.reduce<Record<string, AvailableSlot[]>>((acc, s) => {
    acc[s.dateKey] = acc[s.dateKey] ? [...acc[s.dateKey], s] : [s]
    return acc
  }, {})

  return (
    <div className="page">
      <h1>Book a session with {tutor?.name}</h1>
      {tutor?.subject && <p className="muted">{tutor.subject}</p>}

      <div className="card">
        <h2>Your details</h2>
        <div className="row">
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="contact">Email or phone</label>
            <input id="contact" value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>
        </div>
        {formError && <p className="error">{formError}</p>}
      </div>

      <div className="card">
        <h2>Available time slots</h2>
        {availableSlots.length === 0 ? (
          <p className="muted">No open slots in the next two weeks.</p>
        ) : (
          Object.entries(slotsByDate).map(([dateKey, slots]) => (
            <div className="day-group" key={dateKey}>
              <h3>{slots[0].dateLabel}</h3>
              <div className="slot-grid">
                {slots.map((s) => (
                  <button
                    key={s.slot.id}
                    className="slot-btn"
                    disabled={submitting}
                    onClick={() => handleBookSlot(s)}
                  >
                    {formatTime(s.slot.start_time)}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}