import React, { useCallback, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { apiClient } from '../api/client';

interface UploadZoneProps {
  onUploadSuccess: () => void;
}

const UploadZone: React.FC<UploadZoneProps> = ({ onUploadSuccess }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await uploadFiles(e.dataTransfer.files);
    }
  }, []);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await uploadFiles(e.target.files);
    }
  };

  const uploadFiles = async (files: FileList) => {
    setIsUploading(true);
    setProgress(0);
    
    // Simplistic batch upload tracking
    const totalFiles = files.length;
    let completed = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        await apiClient.post('/media/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        completed++;
        setProgress(Math.round((completed / totalFiles) * 100));
      } catch (err) {
        console.error('Failed to upload file', file.name, err);
      }
    }
    
    setIsUploading(false);
    onUploadSuccess();
  };

  return (
    <div 
      className={`glass-panel ${isDragging ? 'dragging' : ''}`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      style={{
        border: isDragging ? '2px dashed var(--accent-color)' : '2px dashed var(--glass-border)',
        backgroundColor: isDragging ? 'rgba(59, 130, 246, 0.1)' : 'var(--glass-bg)',
        padding: '40px',
        textAlign: 'center',
        marginBottom: '24px',
        transition: 'all 0.3s ease',
        cursor: 'pointer',
        position: 'relative'
      }}
      onClick={() => document.getElementById('fileUpload')?.click()}
    >
      <input 
        id="fileUpload" 
        type="file" 
        multiple 
        accept="image/*,video/*" 
        style={{ display: 'none' }} 
        onChange={handleFileInput}
      />
      
      {isUploading ? (
        <div className="animate-fade-in">
          <UploadCloud size={48} color="var(--accent-color)" style={{ margin: '0 auto 16px' }} />
          <h3>Uploading...</h3>
          <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', marginTop: '16px', overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent-color)', transition: 'width 0.3s' }} />
          </div>
          <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>{progress}% Complete</p>
        </div>
      ) : (
        <div>
          <UploadCloud size={48} color={isDragging ? 'var(--accent-color)' : 'var(--text-secondary)'} style={{ margin: '0 auto 16px' }} />
          <h3 style={{ marginBottom: '8px' }}>Drag & Drop Media Here</h3>
          <p style={{ color: 'var(--text-secondary)' }}>or click to select files from your computer</p>
        </div>
      )}
    </div>
  );
};

export default UploadZone;
