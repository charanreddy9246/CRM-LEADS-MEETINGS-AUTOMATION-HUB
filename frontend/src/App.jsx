import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

// Protected Route Component
const ProtectedRoute = ({ children, user, loading }) => {
  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>
        <div className="spinner" style={{ width: '40px', height: '40px', border: '4px solid var(--primary-glow)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isGreeting, setIsGreeting] = useState(false);
  const [currentGreeting, setCurrentGreeting] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <Router>
      <Routes>
        <Route 
          path="/login" 
          element={
            <Login 
              isGreeting={isGreeting} 
              setIsGreeting={setIsGreeting} 
              currentGreeting={currentGreeting}
              setCurrentGreeting={setCurrentGreeting}
            />
          } 
        />
        <Route 
          path="/" 
          element={
            <ProtectedRoute user={user} loading={loading || isGreeting}>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        {/* Redirect any other path to / */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Router>
  );
};

export default App;
