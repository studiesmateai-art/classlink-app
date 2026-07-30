import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../supabaseClient'
import type { TutorListItem } from '../types'
import { IconUsers } from './icons'

export function AdminPanel() {
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [contact, setContact] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  const [tutors, setTutors] = useState<TutorListItem[]>([])
  const [tutorsLoading, setTutorsLoading] = useState(true)

  async function loadTutors() {
    setTutorsLoading(true)
    const { data } = await supabase
      .from('tutors')
      .select('id, name, subject, contact')
      .or('is_admin.eq.false,is_admin.is.null')
      .order('created_at', { ascending: true })
    setTutors((data as TutorListItem[]) ?? [])
    setTutorsLoading(false)
  }

  useEffect(() => {
    loadTutors()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess(false)

    if (!name.trim() || !username.trim() || !password) {
      setError('Name, username, and password are required.')
      return
    }

    setSaving(true)
    const { error: insertError } = await supabase.from('tutors').insert({
      name: name.trim(),
      subject: subject.trim() || null,
      contact: contact.trim() || null,
      username: username.trim(),
      password,
      is_admin: false,
    })
    setSaving(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    setSuccess(true)
    setName('')
    setSubject('')
    setContact('')
    setUsername('')
    setPassword('')
    loadTutors()
  }

  return (
    <>
      <div className="card">
        <div className="card-title">
          <span className="icon-badge">
            <IconUsers size={17} />
          </span>
          <h2>Add a new tutor</h2>
        </div>
        <form onSubmit={handleSubmit} style={{ marginTop: 18 }}>
          <div className="row">
            <div className="field">
              <label htmlFor="new-name">Name</label>
              <input id="new-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="new-subject">Subject</label>
              <input id="new-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="new-contact">Contact</label>
              <input id="new-contact" value={contact} onChange={(e) => setContact(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="new-username">Username</label>
              <input id="new-username" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="new-password">Password</label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="error">{error}</p>}
          {success && <p style={{ color: 'var(--success)', fontSize: 14 }}>Tutor added!</p>}
          <button type="submit" className="btn" disabled={saving}>
            {saving ? 'Adding...' : 'Add tutor'}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-title">
          <span className="icon-badge">
            <IconUsers size={17} />
          </span>
          <h2>All tutors</h2>
        </div>
        <div style={{ marginTop: 16 }}>
          {tutorsLoading ? (
            <p className="muted">Loading...</p>
          ) : tutors.length === 0 ? (
            <p className="muted">No tutors yet.</p>
          ) : (
            tutors.map((t) => (
              <div className="booking-item" key={t.id}>
                <div>
                  <strong>{t.name}</strong>
                  <div className="muted">{t.subject || 'No subject set'}</div>
                </div>
                <span className="muted">{t.contact || '—'}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
