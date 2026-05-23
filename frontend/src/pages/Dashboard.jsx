import React, { useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, CheckCircle, FileText, Database,
  Trash2, ArrowRight, RefreshCcw, Sparkles, ChevronRight,
  User, DollarSign, Activity, Calendar, FileType,
  LayoutDashboard, Loader2, Sparkle, LogOut
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';

const API_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://127.0.0.1:9002"
  : "https://crm-leads-meetings-automation-hub.onrender.com";

const Dashboard = () => {
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [reviewData, setReviewData] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [mode, setMode] = useState('LEADS'); // 'LEADS' or 'MEETINGS'
  const [meetingResults, setMeetingResults] = useState(null);
  const [syncProgress, setSyncProgress] = useState(null); // { current, total, name }
  const [processProgress, setProcessProgress] = useState(null); // { percent, msg }


  const navigate = useNavigate();


  const handleLogout = async () => {
    try {
      await auth.signOut();
      navigate('/login');
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const formatTime12h = (isoStr) => {
    if (!isoStr) return "";
    try {
      const timePart = isoStr.split('T')[1]?.substring(0, 5);
      if (!timePart) return "";
      let [hours, minutes] = timePart.split(':');
      hours = parseInt(hours);
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // the hour '0' should be '12'
      return `${hours}:${minutes} ${ampm}`;
    } catch (e) { return isoStr; }
  };

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
      setReviewData({ ...res.data, staff: res.data.staff || "" });
    } catch (err) {
      if (err.response?.data?.error === "DUPLICATE_FILE") {
        alert("⚠️ DUPLICATE DETECTED: " + err.response.data.msg);
        resetAll();
      } else {
        alert("AI Brain Error: " + err.message);
      }
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
    setProcessProgress({ percent: 5, msg: "Initializing..." });
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch(`${API_BASE}/process-meeting`, {
        method: 'POST',
        body: formData
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let result = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.type === 'progress') {
              setProcessProgress({ percent: data.percent, msg: data.msg });
            } else if (data.type === 'result') {
              result = data;
            } else if (data.type === 'error') {
              throw new Error(data.msg);
            }
          } catch (e) { console.error("Stream parse error", e); }
        }
      }

      if (result) {
        setReviewData({
          meetings: result.meetings,
          filename: result.filename,
          staff: result.staff || "",
          totalRows: result.total_rows_detected || result.meetings.length
        });
      }
    } catch (err) {
      alert("Meeting Brain Error: " + err.message);
    } finally {
      setIsProcessing(false);
      setProcessProgress(null);
    }
  };


  const confirmAndPush = async () => {
    setIsSubmitting(true);
    try {
      await axios.post(`${API_BASE}/submit-to-zoho`, {
        transcript: reviewData.transcript,
        filename: reviewData.filename,
        staff: reviewData.staff
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
    setSyncProgress({ current: 0, total: reviewData.meetings.length, name: "Initializing..." });
    try {
      const response = await fetch(`${API_BASE}/sync-meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetings: reviewData.meetings,
          filename: reviewData.filename,
          staff: reviewData.staff
        })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let finalResults = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.type === 'progress') {
              setSyncProgress({ current: data.current, total: data.total, name: data.name });
            } else if (data.type === 'result') {
              finalResults = data.results;
            } else if (data.type === 'error') {
              throw new Error(data.msg);
            }
          } catch (e) { console.error("Stream parse error", e); }
        }
      }

      setMeetingResults(finalResults);
      setSuccess(true);
      setReviewData(null);
    } catch (err) {
      alert("Meeting Sync Failed: " + err.message);
    } finally {
      setIsSubmitting(false);
      setSyncProgress(null);
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <nav className="stepper-nav" style={{ display: 'flex', gap: '2rem', padding: '8px 24px', borderRadius: '50px', border: '1px solid var(--border)' }}>
            <StepIndicator step={1} label="UPLOAD" active={!reviewData && !success} done={!!reviewData || success} />
            <ChevronRight size={14} color="var(--border)" />
            <StepIndicator step={2} label="REFINE" active={!!reviewData} done={success} />
            <ChevronRight size={14} color="var(--border)" />
            <StepIndicator step={3} label="SYNC" active={success} done={success} />
          </nav>

          <button
            onClick={handleLogout}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px'
            }}
          >
            <LogOut size={18} /> Logout
          </button>
        </div>
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
                          : ['XLSX', 'XLS'].map(ext => (
                            <span key={ext} style={{ fontSize: '0.65rem', fontWeight: 800, padding: '4px 10px', background: '#f1f5f9', color: 'var(--text-muted)', borderRadius: '6px', border: '1px solid var(--border)' }}>{ext}</span>
                          ))
                        }
                      </div>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        {mode === 'LEADS' ? 'Select CRM audio for High-Fidelity AI Transcription' : 'Select Meetings Excel File for Intelligent Extraction'}
                      </p>

                      <input type="file" onChange={handleFileChange} style={{ display: 'none' }} />
                    </label>
                  ) : (
                    <div style={{ background: '#f8fafc', padding: '2.5rem', borderRadius: '40px', border: '1.5px solid var(--primary)', textAlign: 'center' }}>
                      <FileText size={40} color="var(--primary)" style={{ marginBottom: '1rem' }} />
                      <h4 style={{ wordBreak: 'break-all', marginBottom: '1.5rem', color: 'var(--text-main)' }}>{file.name}</h4>

                      {processProgress && (
                        <div style={{ width: '100%', maxWidth: '300px', margin: '0 auto 1.5rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '8px', textTransform: 'uppercase' }}>
                            <span>{processProgress.msg}</span>
                            <span>{processProgress.percent}%</span>
                          </div>
                          <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${processProgress.percent}%` }}
                              style={{ height: '100%', background: 'var(--primary)', boxShadow: '0 0 10px var(--primary-glow)' }}
                            />
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
                        <button className="btn-premium" onClick={processFile} disabled={isProcessing}>
                          {isProcessing ? 'PROCESSING...' : 'INITIALIZE'}
                        </button>
                        <button className="btn-outline" onClick={() => setFile(null)}><Trash2 size={20} /></button>
                      </div>
                      {isProcessing && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '15px', fontWeight: 600 }}>
                          Please wait, this may take a minute...
                        </p>
                      )}
                    </div>

                  )}
                </div>
              </div>
            </motion.div>
          )}

          {reviewData && !success && mode === 'LEADS' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key="refine-step">
              <div className="glass-card" style={{ padding: '1.2rem 2.5rem 2.5rem 2.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <FileText color="var(--primary)" size={20} />
                    <h2 style={{ fontSize: '1.2rem', color: 'var(--text-main)' }}>Expert Dialogue Transcription</h2>
                  </div>
                </div>
                <textarea
                  value={reviewData.transcript}
                  onChange={(e) => setReviewData({ ...reviewData, transcript: e.target.value })}
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
                    <h2 style={{ fontSize: '1.2rem', color: 'var(--text-main)' }}>
                      Detected Meetings ({reviewData.meetings.length} / {reviewData.totalRows || reviewData.meetings.length})
                    </h2>
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 700, marginBottom: '0.5rem' }}>
                        <User size={12} /> Staff: {m.staff || m.Staff || 'Not Assigned'}
                      </div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.Description}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-main)' }}>
                        <Activity size={12} /> {formatTime12h(m.Start_DateTime)} - {formatTime12h(m.End_DateTime)}
                      </div>
                    </div>

                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {success && (
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} key="success-step" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div className="glass-card" style={{ width: '100%', padding: '3rem 2rem', textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '40px', marginBottom: '2.5rem' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ background: '#ecfdf5', color: '#10b981', width: '60px', height: '60px', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                      <CheckCircle size={30} />
                    </div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{meetingResults?.filter(r => r.success).length || 0} / {meetingResults?.length || 0}</div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>SUCCESSFUL</div>
                  </div>

                  {meetingResults?.some(r => !r.success) && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ background: '#fef2f2', color: '#ef4444', width: '60px', height: '60px', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                        <Activity size={30} />
                      </div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{meetingResults.filter(r => !r.success).length}</div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>FAILED</div>
                    </div>
                  )}
                </div>

                <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '1.5rem', color: 'var(--text-main)', letterSpacing: '1px' }}>Hey Team, it's all done! 🚀</h1>

                {meetingResults && (
                  <div style={{ maxWidth: '800px', margin: '0 auto 2.5rem', maxHeight: '40vh', overflowY: 'auto', paddingRight: '12px' }}>
                    {meetingResults.map((r, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px 20px', background: '#f8fafc', borderRadius: '15px',
                        marginBottom: '8px', border: '1px solid var(--border)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                          <div style={{ background: r.success ? '#10b981' : '#ef4444', width: '8px', height: '8px', borderRadius: '50%' }} />
                          <div style={{ textAlign: 'left' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{r.subject}{r.name ? ` : ${r.name}` : ''}</div>
                            {!r.success && <div style={{ fontSize: '0.7rem', color: '#ef4444' }}>Error: {r.error}</div>}
                          </div>

                        </div>
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 800,
                          color: r.success ? '#10b981' : '#ef4444',
                          background: r.success ? '#ecfdf5' : '#fef2f2',
                          padding: '4px 10px', borderRadius: '6px'
                        }}>
                          {r.success ? 'SYNCED' : 'FAILED'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button className="btn-premium" onClick={resetAll} style={{ width: '250px', padding: '14px', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    NEW UPLOAD
                  </button>
                </div>

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

          {syncProgress && (
            <div style={{ width: '400px', marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '5px' }}>
                <span>{syncProgress.name === "Initializing..." ? "WAKING UP AI..." : `SYNCING: ${syncProgress.name}`}</span>
                <span>{syncProgress.current} / {syncProgress.total}</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                  style={{ height: '100%', background: 'var(--primary)', boxShadow: '0 0 10px var(--primary-glow)' }}
                />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '15px' }}>
            <button
              className="btn-premium"
              onClick={mode === 'LEADS' ? confirmAndPush : syncMeetings}
              disabled={isSubmitting}
              style={{ width: '300px', padding: '12px', borderRadius: '12px', fontSize: '1rem' }}
            >
              <Database size={18} />
              {isSubmitting ? (syncProgress ? 'IN PROGRESS...' : 'SYNCING...') : `FINAL SYNC TO ZOHO ${mode === 'MEETINGS' ? 'EVENTS' : 'LEADS'}`}
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

export default Dashboard;
