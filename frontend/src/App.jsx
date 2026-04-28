import React, { useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, CheckCircle, FileText, Database, 
  Trash2, ArrowRight, RefreshCcw, Sparkles, ChevronRight,
  User, DollarSign, Activity, Calendar, FileType, 
  LayoutDashboard, Loader2, Sparkle
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const App = () => {
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [reviewData, setReviewData] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [mode, setMode] = useState('LEADS'); // 'LEADS' or 'MEETINGS'
  const [meetingResults, setMeetingResults] = useState(null);

  const resetAll = () => {
    setFile(null);
    setReviewData(null);
    setIsProcessing(false);
    setSuccess(false);
    setMeetingResults(null);
  };

  const handleFileChange = (e) => {
    if (e.target.files[0]) setFile(e.target.files[0]);
  };

  const startTranscription = async () => {
    if (!file) return;
    setIsProcessing(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post(`${API_BASE}/process-audio`, formData);
      setReviewData(res.data);
    } catch (err) {
      alert("AI Brain Error: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const processFile = async () => {
    if (!file) return;
    if (mode === 'LEADS') {
      await startTranscription();
    } else {
      await startMeetingProcessing();
    }
  };

  const startMeetingProcessing = async () => {
    setIsProcessing(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post(`${API_BASE}/process-meeting`, formData);
      if (res.data.error) {
        alert(res.data.error);
      } else {
        setReviewData({ meetings: res.data.meetings, filename: res.data.filename });
      }
    } catch (err) {
      alert("Meeting Brain Error: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmAndPush = async () => {
    setIsSubmitting(true);
    try {
      await axios.post(`${API_BASE}/submit-to-zoho`, { 
        transcript: reviewData.transcript,
        filename: reviewData.filename 
      });
      setSuccess(true);
      setReviewData(null);
    } catch (err) {
      alert("Zoho Push Failed: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const syncMeetings = async () => {
    setIsSubmitting(true);
    try {
      const res = await axios.post(`${API_BASE}/sync-meetings`, { 
        meetings: reviewData.meetings,
        filename: reviewData.filename 
      });
      setMeetingResults(res.data.results);
      setSuccess(true);
      setReviewData(null);
    } catch (err) {
      alert("Meeting Sync Failed: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const StepIndicator = ({ step, label, active, done }) => (
    <div className={`stepper-item ${active ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div className="step-circle" style={{ 
        background: done ? 'var(--success)' : (active ? 'var(--primary)' : '#f1f5f9'),
        color: done || active ? 'white' : 'var(--text-muted)'
      }}>
        {done ? <CheckCircle size={20} /> : step}
      </div>
      <span style={{ fontSize: '0.9rem', fontWeight: 600, color: active ? 'var(--text-main)' : 'var(--text-muted)' }}>{label}</span>
    </div>
  );

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)' }}>
      {/* FIXED HEADER SECTION */}
      <header style={{ 
        padding: '1rem 4rem', background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(10px)', 
        borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', 
        alignItems: 'center', zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ background: 'var(--primary)', padding: '8px', borderRadius: '10px', boxShadow: '0 4px 15px var(--primary-glow)' }}>
            <Sparkles color="white" size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-1px', color: 'var(--text-main)' }}>
              CRM <span style={{ fontWeight: 300, color: 'var(--text-muted)' }}>PIPELINE</span>
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>LEADS & MEETINGS AUTOMATION HUB</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={() => { setMode('LEADS'); resetAll(); }}
            style={{ 
              padding: '8px 16px', borderRadius: '12px', border: '1px solid var(--border)',
              background: mode === 'LEADS' ? 'var(--primary)' : 'white',
              color: mode === 'LEADS' ? 'white' : 'var(--text-main)',
              display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600
            }}
          >
            <Sparkles size={16} /> LEADS
          </button>
          <button 
            onClick={() => { setMode('MEETINGS'); resetAll(); }}
            style={{ 
              padding: '8px 16px', borderRadius: '12px', border: '1px solid var(--border)',
              background: mode === 'MEETINGS' ? 'var(--primary)' : 'white',
              color: mode === 'MEETINGS' ? 'white' : 'var(--text-main)',
              display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600
            }}
          >
            <Calendar size={16} /> MEETINGS
          </button>
        </div>

        <nav className="stepper-nav" style={{ display: 'flex', gap: '2rem', padding: '8px 24px', borderRadius: '50px', border: '1px solid var(--border)' }}>
          <StepIndicator step={1} label="UPLOAD" active={!reviewData && !success} done={!!reviewData || success} />
          <ChevronRight size={14} color="var(--border)" />
          <StepIndicator step={2} label="REFINE" active={!!reviewData} done={success} />
          <ChevronRight size={14} color="var(--border)" />
          <StepIndicator step={3} label="SYNC" active={success} done={success} />
        </nav>
      </header>

      {/* SCROLLABLE MAIN CONTENT */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '0 10%', paddingBottom: '12rem' }}>
        <AnimatePresence mode="wait">
          
          {!reviewData && !success && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key="upload-step" style={{ height: '100%', display: 'flex', alignItems: 'center' }}>
              <div className="glass-card" style={{ width: '100%', padding: '6rem 2rem', textAlign: 'center' }}>
                <div style={{ maxWidth: '450px', margin: '0 auto' }}>
                  {!file ? (
                    <label style={{ cursor: 'pointer' }}>
                      <div style={{ background: '#f8fafc', padding: '3rem', borderRadius: '40px', border: '2px dashed var(--border)', marginBottom: '1.5rem' }}>
                        <Upload size={48} color="var(--primary)" />
                      </div>
                      <h3 style={{ color: 'var(--text-main)', marginBottom: '1rem', textTransform: 'uppercase' }}>
                        UPLOAD {mode === 'LEADS' ? 'AUDIO FILE' : 'DOCUMENT'}
                      </h3>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '2rem', flexWrap: 'wrap' }}>
                        {mode === 'LEADS' 
                          ? ['MP3', 'WAV', 'M4A', 'OGG', 'FLAC', 'WEBM', 'MP4'].map(ext => (
                            <span key={ext} style={{ fontSize: '0.65rem', fontWeight: 800, padding: '4px 10px', background: '#f1f5f9', color: 'var(--text-muted)', borderRadius: '6px', border: '1px solid var(--border)' }}>{ext}</span>
                          ))
                          : ['PDF', 'DOCX', 'JPG', 'PNG'].map(ext => (
                            <span key={ext} style={{ fontSize: '0.65rem', fontWeight: 800, padding: '4px 10px', background: '#f1f5f9', color: 'var(--text-muted)', borderRadius: '6px', border: '1px solid var(--border)' }}>{ext}</span>
                          ))
                        }
                      </div>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        {mode === 'LEADS' ? 'Select CRM audio for High-Fidelity AI Transcription' : 'Select Meetings Document for Intelligent Extraction'}
                      </p>
                      <input type="file" onChange={handleFileChange} style={{ display: 'none' }} />
                    </label>
                  ) : (
                    <div style={{ background: '#f8fafc', padding: '2.5rem', borderRadius: '40px', border: '1.5px solid var(--primary)' }}>
                      <FileText size={40} color="var(--primary)" style={{ marginBottom: '1rem' }} />
                      <h4 style={{ wordBreak: 'break-all', marginBottom: '1.5rem', color: 'var(--text-main)' }}>{file.name}</h4>
                      <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
                         <button className="btn-premium" onClick={processFile} disabled={isProcessing}>
                          {isProcessing ? 'PROCESSING...' : 'INITIALIZE'}
                        </button>
                        <button className="btn-outline" onClick={() => setFile(null)}><Trash2 size={20} /></button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {reviewData && !success && mode === 'LEADS' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key="refine-step">
              <div className="glass-card" style={{ padding: '1.2rem 2.5rem 2.5rem 2.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
                  <FileText color="var(--primary)" size={20} />
                  <h2 style={{ fontSize: '1.2rem', color: 'var(--text-main)' }}>Expert Dialogue Transcription</h2>
                </div>
                <textarea 
                  value={reviewData.transcript} 
                  onChange={(e) => setReviewData({...reviewData, transcript: e.target.value})}
                  style={{ 
                    width: '100%', height: 'calc(100vh - 280px)', background: '#f8fafc', border: '1px solid var(--border)', 
                    borderRadius: '16px', padding: '1.5rem', color: 'var(--text-main)', fontSize: '1.05rem', lineHeight: '1.8',
                    outline: 'none', resize: 'none'
                  }}
                />
              </div>
            </motion.div>
          )}

          {reviewData && !success && mode === 'MEETINGS' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key="meeting-refine-step">
              <div className="glass-card" style={{ padding: '1.2rem 2.5rem 2.5rem 2.5rem' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Calendar color="var(--primary)" size={20} />
                    <h2 style={{ fontSize: '1.2rem', color: 'var(--text-main)' }}>Detected Meetings ({reviewData.meetings.length})</h2>
                   </div>
                 </div>
                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                   {reviewData.meetings.map((m, idx) => (
                     <div key={idx} style={{ background: 'white', padding: '1.5rem', borderRadius: '20px', border: '1px solid var(--border)', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase' }}>{m.Meeting_Title}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{m.Start_DateTime?.split('T')[0]}</span>
                        </div>
                        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>{m.Contact_Name}</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.Description}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-main)' }}>
                          <Activity size={12} /> {m.Start_DateTime?.split('T')[1]?.substring(0,5)} - {m.End_DateTime?.split('T')[1]?.substring(0,5)}
                        </div>
                     </div>
                   ))}
                 </div>
              </div>
            </motion.div>
          )}

          {success && (
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} key="success-step" style={{ height: '100%', display: 'flex', alignItems: 'center' }}>
              <div className="glass-card" style={{ width: '100%', padding: '6rem 2rem', textAlign: 'center' }}>
                <div style={{ background: 'var(--primary)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem' }}>
                  <CheckCircle size={40} color="white" />
                </div>
                <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '1rem', color: 'var(--text-main)' }}>VALIDATED</h1>
                <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                  {mode === 'LEADS' ? 'Data pushed to Zoho India Leads and Drive Archive.' : `Synced ${meetingResults?.length || 0} meetings to Zoho Events.`}
                </p>
                {meetingResults && (
                  <div style={{ maxWidth: '600px', margin: '0 auto 2rem', textAlign: 'left' }}>
                    {meetingResults.map((r, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', borderBottom: '1px solid #eee' }}>
                        <span style={{ fontWeight: 600 }}>{r.subject}</span>
                        <span style={{ color: r.success ? 'var(--success)' : 'red' }}>{r.success ? 'SYNCED' : 'FAILED'}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button className="btn-premium" onClick={resetAll} style={{ margin: '0 auto' }}>NEW {mode === 'LEADS' ? 'CALL' : 'DOC'}</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* FIXED BOTTOM ACTION DOCK */}
      {reviewData && !success && (
        <div style={{ 
          position: 'fixed', bottom: 0, left: 0, width: '100%', background: 'rgba(255,255,255,0.95)', 
          backdropFilter: 'blur(10px)', borderTop: '1px solid var(--border)', padding: '0.8rem 4rem', 
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.8rem', zIndex: 100 
        }}>
          {/* AI ADVISORY ALERT */}
          <div style={{ 
            display: 'flex', alignItems: 'center', gap: '8px', background: '#fffbeb', 
            border: '1px solid #fde68a', padding: '6px 15px', borderRadius: '30px',
            color: '#b45309', fontSize: '0.75rem', fontWeight: 600
          }}>
             <Sparkles size={12} /> AI ADVISORY: VERIFY FOR 100% LITERAL TRUTH BEFORE FINAL SYNC.
          </div>

          <div style={{ display: 'flex', gap: '15px' }}>
            <button 
              className="btn-premium" 
              onClick={mode === 'LEADS' ? confirmAndPush : syncMeetings} 
              disabled={isSubmitting} 
              style={{ width: '300px', padding: '12px', borderRadius: '12px', fontSize: '1rem' }}
            >
              <Database size={18} />
              {isSubmitting ? 'SYNCING...' : `FINAL SYNC TO ZOHO ${mode === 'MEETINGS' ? 'EVENTS' : 'LEADS'}`}
            </button>
            <button className="btn-outline" onClick={resetAll} style={{ width: '120px', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '12px' }}>
              <Trash2 size={16} /> CANCEL
            </button>
          </div>
          <footer style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            &copy; 2026 CRM PIPELINE // HIGH-INTELLIGENCE DATA AUTOMATION
          </footer>
        </div>
      )}

      {!reviewData && !success && (
         <div style={{ position: 'fixed', bottom: 0, left: 0, width: '100%', padding: '2rem', textAlign: 'center', opacity: 0.5 }}>
            <p style={{ fontSize: '0.75rem' }}>&copy; 2026 CRM PIPELINE</p>
         </div>
      )}
    </div>
  );
};

export default App;
