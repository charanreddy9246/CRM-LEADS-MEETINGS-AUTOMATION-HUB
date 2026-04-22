import { useState, useRef } from 'react';
import './index.css';

function App() {
  const [isUploading, setIsUploading] = useState(false);
  const [results, setResults] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    
    setIsUploading(true);
    setResults([]);
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://localhost:8000/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      setResults(data.results);
    } catch (err) {
      console.error(err);
      alert('Error processing file');
    } finally {
      setIsUploading(false);
    }
  };

  const onDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  const captureScreenshot = async () => {
    try {
      // Create a capture modal or just use standard API
      const stream = await navigator.mediaDevices.getDisplayMedia({ 
        video: { cursor: "always" },
        audio: false 
      });
      
      const video = document.createElement('video');
      video.srcObject = stream;
      video.onloadedmetadata = async () => {
        video.play();
        
        // Wait for it to play
        await new Promise(r => setTimeout(r, 500));
        
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        
        // Stop the stream
        stream.getTracks().forEach(track => track.stop());
        
        // Convert to blob
        canvas.toBlob((blob) => {
          const file = new File([blob], `screenshot_${Date.now()}.png`, { type: 'image/png' });
          handleFile(file);
        }, 'image/png');
      };
    } catch (err) {
      console.error('Screenshot error:', err);
    }
  };

  return (
    <div className="dashboard-container">
      <header>
        <h1>AI CRM Sync</h1>
        <p className="subtitle">High-fidelity meeting extraction from any source</p>
      </header>

      {!isUploading && results.length === 0 && (
        <div 
          className={`upload-area ${isDragging ? 'dragging' : ''}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current.click()}
        >
          <div className="upload-icon">📄</div>
          <p className="upload-text">Drop PDF, Word or Image here</p>
          <p className="subtitle">or click to browse files</p>
          <input 
            type="file" 
            ref={fileInputRef}
            className="input-file" 
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files[0])}
          />
          <div style={{ marginTop: '20px' }} onClick={(e) => e.stopPropagation()}>
             <button 
                onClick={captureScreenshot}
                className="btn-screenshot"
             >
               📸 Live Screen Capture
             </button>
          </div>
        </div>
      )}

      {isUploading && (
        <div className="upload-area processing">
          <div className="loading-spinner"></div>
          <p className="upload-text">AI is running extraction...</p>
          <div className="progress-bar">
            <div className="progress-inner"></div>
          </div>
        </div>
      )}

      {results.length > 0 && !isUploading && (
        <div className="results-section">
          <div className="results-header">
            <h2>Extraction Summary</h2>
            <button onClick={() => setResults([])} className="btn-secondary">New Upload</button>
          </div>
          <div className="results-grid">
            {results.map((res, i) => (
              <div key={i} className="meeting-card" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="card-status-dot" style={{ backgroundColor: res.success ? 'var(--success)' : 'var(--error)' }}></div>
                <div className="meeting-info">
                  <h3>{res.subject}</h3>
                  <p className="id-text">{res.success ? `CRM ID: ${res.id}` : res.error}</p>
                </div>
                <div className={`status-badge ${res.success ? 'status-success' : 'status-error'}`}>
                  {res.success ? 'SYNCED' : 'FAILED'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
