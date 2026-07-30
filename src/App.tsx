import { Routes, Route, Navigate } from 'react-router-dom'
import Admin from './pages/Admin'
import Book from './pages/Book'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Admin />} />
      <Route path="/admin" element={<Navigate to="/login" replace />} />
      <Route path="/dashboard" element={<Admin />} />
      <Route path="/admin-panel" element={<Admin />} />
      <Route path="/book/:tutorId" element={<Book />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
