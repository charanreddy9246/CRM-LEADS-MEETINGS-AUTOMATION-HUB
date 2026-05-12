import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Mail, Lock, ArrowRight, ShieldCheck, Cpu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { signInWithEmailAndPassword, setPersistence, browserSessionPersistence } from 'firebase/auth';

const GREETINGS = [
  "Hello Capital Solution",
  "Welcome Back, Team!",
  "Initializing Intelligence...",
  "Ready for Growth?",
  "Syncing with Excellence",
  "Your Pipeline is Ready",
  "Systems Online",
  "Intelligence Optimized",
  "Capital Solution Hub Active",
  "Data Stream Connected"
];

const Login = ({ isGreeting, setIsGreeting, currentGreeting, setCurrentGreeting }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  React.useEffect(() => {
    if (auth.currentUser && !isGreeting) {
      navigate('/');
    }
  }, [isGreeting, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    try {
      await setPersistence(auth, browserSessionPersistence);
      await signInWithEmailAndPassword(auth, email, password);
      
      const randomIndex = Math.floor(Math.random() * GREETINGS.length);
      const randomMsg = GREETINGS[randomIndex];
      setCurrentGreeting(randomMsg);
      
      setIsGreeting(true);
      setTimeout(() => {
        setIsGreeting(false);
        navigate('/');
      }, 2000); 
    } catch (err) {
      console.error("Login error:", err);
      let msg = err.message.replace('Firebase: ', '');
      if (msg.includes('auth/invalid-credential')) msg = "Invalid email or password.";
      setError(msg);
      setIsLoading(false);
    }
  };

  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
      overflow: 'hidden',
      position: 'relative'
    }}>
      <AnimatePresence>
        {isGreeting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'var(--primary)',
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white'
            }}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring' }}
            >
              <Sparkles size={80} style={{ marginBottom: '2rem' }} />
            </motion.div>
            <motion.h1
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              style={{ fontSize: '3.5rem', fontWeight: 800, textAlign: 'center', maxWidth: '800px', padding: '0 2rem' }}
            >
              {currentGreeting}
            </motion.h1>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: '200px' }}
              transition={{ delay: 0.6, duration: 0.8 }}
              style={{ height: '4px', background: 'white', marginTop: '2rem', borderRadius: '2px', opacity: 0.5 }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background Decorative Elements */}
      <div style={{
        position: 'absolute', top: '-10%', right: '-5%', width: '400px', height: '400px',
        background: 'radial-gradient(circle, var(--primary-glow) 0%, transparent 70%)',
        opacity: 0.4, filter: 'blur(60px)', zIndex: 0
      }}></div>
      <div style={{
        position: 'absolute', bottom: '-10%', left: '-5%', width: '500px', height: '500px',
        background: 'radial-gradient(circle, #cbd5e1 0%, transparent 70%)',
        opacity: 0.3, filter: 'blur(80px)', zIndex: 0
      }}></div>

      <div style={{ 
        flex: 1, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: '2rem',
        zIndex: 1
      }}>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="glass-card" 
          style={{ 
            maxWidth: '450px', 
            width: '100%', 
            padding: '3.5rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.08)',
            border: '1px solid rgba(255,255,255,0.8)'
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
              style={{ 
                background: 'var(--primary)', 
                width: '64px', 
                height: '64px', 
                borderRadius: '18px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                margin: '0 auto 1.5rem',
                boxShadow: '0 8px 20px var(--primary-glow)'
              }}
            >
              <Cpu color="white" size={32} />
            </motion.div>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.5rem', letterSpacing: '-1px' }}>
              Welcome Back
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
              Secure access to CRM Pipeline Intelligence
            </p>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }} 
              animate={{ opacity: 1, height: 'auto' }}
              style={{ 
                background: '#fee2e2', 
                color: '#b91c1c', 
                padding: '10px 15px', 
                borderRadius: '8px', 
                fontSize: '0.85rem',
                marginBottom: '1.5rem',
                border: '1px solid #fecaca'
              }}
            >
              {error}
            </motion.div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div style={{ position: 'relative' }}>
              <Mail 
                size={18} 
                style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} 
              />
              <input 
                type="email" 
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '14px 14px 14px 48px',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  background: '#f8fafc',
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'all 0.2s ease'
                }}
              />
            </div>

            <div style={{ position: 'relative' }}>
              <Lock 
                size={18} 
                style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} 
              />
              <input 
                type="password" 
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '14px 14px 14px 48px',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  background: '#f8fafc',
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'all 0.2s ease'
                }}
              />
            </div>

            <button 
              type="submit" 
              disabled={isLoading}
              className="btn-premium"
              style={{ 
                marginTop: '1rem', 
                padding: '14px', 
                borderRadius: '12px', 
                fontSize: '1rem', 
                justifyContent: 'center',
                gap: '10px'
              }}
            >
              {isLoading ? (
                <div className="spinner" style={{ width: '20px', height: '20px', border: '3px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
              ) : (
                <>Sign In <ArrowRight size={18} /></>
              )}
            </button>
          </form>

          <div style={{ 
            marginTop: '2.5rem', 
            paddingTop: '1.5rem', 
            borderTop: '1px solid var(--border)', 
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            color: 'var(--text-muted)',
            fontSize: '0.85rem'
          }}>
            <ShieldCheck size={16} /> Enterprise Grade Security Enabled
          </div>
        </motion.div>
      </div>

      {/* Hero Section / Side Panel */}
      <div style={{ 
        flex: 1, 
        background: 'var(--primary)', 
        display: 'none', 
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        padding: '4rem',
        position: 'relative',
        overflow: 'hidden'
      }} className="login-hero">
        <div style={{ 
          position: 'absolute', 
          width: '200%', 
          height: '200%', 
          background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 60%)',
          top: '-50%',
          left: '-50%',
          animation: 'pulse 10s infinite'
        }}></div>

        <div style={{ position: 'relative', zIndex: 2, textAlign: 'center' }}>
          <Sparkles size={64} style={{ marginBottom: '2rem', opacity: 0.8 }} />
          <h2 style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '1.5rem', lineHeight: 1.1 }}>
            Accelerate Your <br />Sales Pipeline
          </h2>
          <p style={{ fontSize: '1.2rem', opacity: 0.9, maxWidth: '500px', lineHeight: 1.6 }}>
            Automate lead extraction and meeting summaries with state-of-the-art AI integration.
          </p>
        </div>
        
        <div style={{ 
          position: 'absolute', 
          bottom: '4rem', 
          display: 'flex', 
          gap: '2rem', 
          opacity: 0.6,
          fontSize: '0.9rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '1px'
        }}>
          <span>Zoho CRM</span>
          <span>OpenAI</span>
          <span>Groq AI</span>
        </div>
      </div>

      <style>{`
        @media (min-width: 1024px) {
          .login-hero { display: flex !important; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.1; }
          50% { transform: scale(1.1); opacity: 0.2; }
          100% { transform: scale(1); opacity: 0.1; }
        }
      `}</style>
    </div>
  );
};

export default Login;
