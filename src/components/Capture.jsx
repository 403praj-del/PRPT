import React, { useState } from 'react';
import {
  X,
  Upload,
  Camera as CameraIcon,
  Check,
  Loader2,
  Sparkles,
  AlertCircle,
  FileText,
  Settings as SettingsIcon,
} from 'lucide-react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { analyzeImage } from '../services/ocr';
import { submitToGoogleForm } from '../services/api';
import { FORM_CONFIG } from '../config/constants';

export default function Capture({ onCancel }) {
  const [step, setStep] = useState('select');
  const [imagePreview, setImagePreview] = useState(null);
  const [formData, setFormData] = useState({
    amount: '',
    category: FORM_CONFIG.categories[0],
    method: FORM_CONFIG.paymentMethods[0],
    date: new Date().toISOString().split('T')[0],
    merchant: '',
    invoice_number: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [errorType, setErrorType] = useState('generic');

  /* -------------------- PERMISSIONS -------------------- */

  const ensurePermission = async (type) => {
    try {
      const status = await Camera.checkPermissions();
      if (type === 'camera' && status.camera !== 'granted') {
        const res = await Camera.requestPermissions({ permissions: ['camera'] });
        if (res.camera !== 'granted') throw new Error('permission');
      }
      if (type === 'photos' && status.photos !== 'granted') {
        const res = await Camera.requestPermissions({ permissions: ['photos'] });
        if (res.photos !== 'granted') throw new Error('permission');
      }
      return true;
    } catch {
      setErrorType('permission');
      setErrorMsg(
        'Permission required. Please enable Camera / Storage permissions.',
      );
      setStep('error');
      return false;
    }
  };

  /* -------------------- OCR PIPELINE -------------------- */

  const startOCR = async (source, preview = null) => {
    try {
      setStep('processing');
      setErrorMsg('');

      if (preview) setImagePreview(preview);

      const result = await analyzeImage(source);

      setFormData({
        amount: result.amount || '',
        category: result.category || FORM_CONFIG.categories[0],
        method: result.payment_method || FORM_CONFIG.paymentMethods[0],
        date: result.date || new Date().toISOString().split('T')[0],
        merchant: result.merchant || '',
        invoice_number: result.invoice_number || '',
      });

      setStep(result.hasFields ? 'form' : 'format_warning');
    } catch (err) {
      console.error('[OCR ERROR]', err);

      const msg = err?.message || 'ocr_failed';

      if (msg === 'permission') {
        setErrorType('permission');
        setErrorMsg(
          'Permission denied. Please allow Camera / Storage access.',
        );
      } else if (msg === 'prepare_failed') {
        setErrorType('prep');
        setErrorMsg('Unable to prepare image for analysis.');
      } else if (msg === 'ocr_failed') {
        setErrorType('generic');
        setErrorMsg('OCR failed. Please try a clearer image.');
      } else {
        setErrorType('generic');
        setErrorMsg(msg);
      }

      setStep('error');
    }
  };

  /* -------------------- HANDLERS -------------------- */

  const handleCamera = async () => {
    if (!(await ensurePermission('camera'))) return;

    try {
      const photo = await Camera.getPhoto({
        quality: 90,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
      });

      if (!photo.path || !photo.webPath)
        throw new Error('prepare_failed');

      await startOCR(photo.path, photo.webPath);
    } catch {
      setErrorType('prep');
      setErrorMsg('Failed to capture image.');
      setStep('error');
    }
  };

  const handleGallery = async () => {
    if (!(await ensurePermission('photos'))) return;

    try {
      const photo = await Camera.getPhoto({
        quality: 90,
        resultType: CameraResultType.Uri,
        source: CameraSource.Photos,
      });

      if (!photo.path || !photo.webPath)
        throw new Error('prepare_failed');

      await startOCR(photo.path, photo.webPath);
    } catch {
      setErrorType('prep');
      setErrorMsg('Failed to load image.');
      setStep('error');
    }
  };

  const handlePDF = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setStep('processing');

      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

      const buffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: buffer }).promise;
      const page = await pdf.getPage(1);

      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({
        canvasContext: canvas.getContext('2d'),
        viewport,
      }).promise;

      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      await startOCR(dataUrl, dataUrl);
    } catch {
      setErrorType('generic');
      setErrorMsg('PDF not supported or corrupted.');
      setStep('error');
    }
  };

  /* -------------------- SUBMIT -------------------- */

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    const ok = await submitToGoogleForm(formData);
    setIsSubmitting(false);
    if (ok) {
      setStep('success');
      setTimeout(onCancel, 1500);
    } else {
      alert('Submission failed. Check internet.');
    }
  };

  /* -------------------- UI STATES -------------------- */

  if (step === 'select') {
    return (
      <div className="h-full flex flex-col bg-surface">
        <Header onCancel={onCancel} title="Add Payment" />

        <div className="flex-1 p-6 space-y-6">
          <button onClick={handleCamera} className="scan-btn">
            <CameraIcon size={32} />
            Scan Receipt
          </button>

          <div className="grid grid-cols-2 gap-4">
            <button onClick={handleGallery} className="upload-btn">
              <Upload size={24} /> Photos
            </button>

            <label className="upload-btn">
              <FileText size={24} /> PDF
              <input
                type="file"
                accept="application/pdf"
                hidden
                onChange={handlePDF}
              />
            </label>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'processing') {
    return (
      <Center>
        <Loader2 className="animate-spin" size={48} />
        <p>Analyzing…</p>
      </Center>
    );
  }

  if (step === 'format_warning') {
    return (
      <Center>
        <AlertCircle size={48} />
        <p>Text detected but format not recognized.</p>
        <button onClick={() => setStep('form')}>Fill Manually</button>
      </Center>
    );
  }

  if (step === 'error') {
    return (
      <Center>
        <AlertCircle size={48} />
        <h3>OCR Error</h3>
        <p>{errorMsg}</p>

        {errorType === 'permission' && (
          <button onClick={() => alert('Enable permissions in App Settings')}>
            <SettingsIcon size={18} /> Open Settings
          </button>
        )}

        <button onClick={() => setStep('select')}>Try Again</button>
      </Center>
    );
  }

  if (step === 'success') {
    return (
      <Center>
        <Check size={48} />
        <h2>Recorded!</h2>
      </Center>
    );
  }

  /* -------------------- FORM -------------------- */

  return (
    <div className="h-full flex flex-col bg-surface">
      <Header onCancel={onCancel} title="Confirm Expense" />

      <div className="flex-1 p-6 space-y-6">
        {imagePreview && (
          <img
            src={imagePreview}
            className="h-48 w-full object-cover rounded"
            alt="preview"
          />
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            value={formData.amount}
            onChange={(e) =>
              setFormData({ ...formData, amount: e.target.value })
            }
            placeholder="Amount"
            required
          />

          <input
            value={formData.merchant}
            onChange={(e) =>
              setFormData({ ...formData, merchant: e.target.value })
            }
            placeholder="Merchant"
          />

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : 'Save'}
            <Sparkles size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}

/* -------------------- HELPERS -------------------- */

const Header = ({ title, onCancel }) => (
  <div className="p-4 flex justify-between border-b">
    <h2>{title}</h2>
    <button onClick={onCancel}>
      <X />
    </button>
  </div>
);

const Center = ({ children }) => (
  <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-6">
    {children}
  </div>
);
