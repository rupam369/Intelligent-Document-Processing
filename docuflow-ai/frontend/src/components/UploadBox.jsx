/**
 * Drag-and-drop upload component.
 *
 * Handles file validation, size validation, upload progress, loading, error
 * messages and retry - all in one reusable component.
 */
import { useCallback, useRef, useState } from 'react';
import { api } from '../services/api.js';
import { formatBytes } from '../utils/format.js';
import useToast from './Toast.jsx';

const ACCEPTED = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
const MAX_SIZE_MB = 15;

function validateFile(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!['pdf', 'jpg', 'jpeg', 'png'].includes(extension)) {
    return `"${file.name}" is not a supported format. Use PDF, JPG or PNG.`;
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return `"${file.name}" is ${formatBytes(file.size)}. The maximum size is ${MAX_SIZE_MB} MB.`;
  }
  if (file.size === 0) {
    return `"${file.name}" is empty.`;
  }
  return null;
}

export default function UploadBox({ onUploaded, multiple = false }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState(null);
  const [progress, setProgress] = useState(null);
  const [uploading, setUploading] = useState(false);

  const upload = useCallback(
    async (file) => {
      const error = validateFile(file);
      if (error) {
        setRejected(error);
        toast.error('Upload rejected', error);
        return;
      }

      setRejected(null);
      setUploading(true);
      setProgress(0);

      try {
        const payload = await api.uploadDocument(file, { onProgress: setProgress });
        toast.success('Upload complete', `"${file.name}" is now being processed.`);
        onUploaded?.(payload);
      } catch (uploadError) {
        setRejected(uploadError.message);
        toast.error('Upload failed', uploadError.message);
      } finally {
        setUploading(false);
      }
    },
    [onUploaded, toast],
  );

  const handleFiles = useCallback(
    (fileList) => {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      if (multiple) {
        files.forEach((file) => upload(file));
      } else {
        upload(files[0]);
      }
    },
    [multiple, upload],
  );

  const retry = useCallback(() => {
    setRejected(null);
    inputRef.current?.click();
  }, []);

  return (
    <div>
      <div
        className={`dropzone ${dragging ? 'dragging' : ''} ${rejected ? 'rejected' : ''}`}
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
        }}
      >
        <div className="dropzone-icon">{uploading ? '…' : '⇪'}</div>
        <h3>{uploading ? 'Uploading your document...' : 'Drag & drop a document here'}</h3>
        <p>or click to browse. PDF, JPG and PNG are supported.</p>

        <div className="dropzone-formats">
          {['PDF', 'JPG', 'PNG'].map((format) => (
            <span key={format} className="badge neutral">
              {format}
            </span>
          ))}
          <span className="badge neutral">Max {MAX_SIZE_MB} MB</span>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          multiple={multiple}
          hidden
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </div>

      {uploading && progress !== null ? (
        <div className="upload-progress">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-meta">
            <span>Uploading...</span>
            <span>{progress}%</span>
          </div>
        </div>
      ) : null}

      {rejected ? (
        <div className="alert danger" style={{ marginTop: 14 }}>
          <span className="alert-icon">!</span>
          <div className="alert-body">
            <div className="alert-title">We could not accept that file</div>
            <div className="alert-text">{rejected}</div>
          </div>
          <button className="btn sm" onClick={retry}>
            Try another file
          </button>
        </div>
      ) : null}
    </div>
  );
}
