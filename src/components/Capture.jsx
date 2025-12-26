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
  const [step, setStep] = useState('select'); // select | processing | form | success | error | format_warning
  const [image, setImage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [errorType, setErrorType] = useState(null);

  const [formData, setFormData] = useState({
    amount: '',
    category: FORM_CONFIG.categories[0],
    method: FORM_CONFIG.paymentMethods[0],
    date: new Date().toISOString().split('T')[0],
    merchant: '',
    invoice_number: '',
  });

  /* ---------------- PERMISSIONS ---------------- */

  const ensurePermission = async (type) => {
    try {
      const status = await Camera.checkPermissions();
      if (type === 'camera' && status.camera !== 'granted') {
        const r = await Camera.requestPermissions({ permissions: ['camera'] });
        if (r.camera !== 'granted') throw new Error();
      }
      if (type === 'photos' && status.photos !== 'granted') {
        const r = await Camera.requestPermissions({ permissions: ['photos'] });
        if (r.photos !== 'granted') throw new Error();
      }
      return true;
    } catch {
      setErrorMsg('Permission required. Please enable camera/storage access.');
      setErrorType('permission');
      setStep('error');
      return false;
    }
  };

  /* ---------------- CORE PROCESSING ---------------- */

  const startProcessing = async (uri) => {
    setStep('processing');
    setErrorMsg('');

    try {
      // Preview directly from URI
      setImage(uri);

      // OCR only for IMAGE URI
      const result = await analyzeImage(uri);

      setFormData((prev) => ({
        ...prev,
        amount: result.amount || '',
        category: result.category || FORM_CONFIG.categories[0],
        method: result.payment_method || FORM_CONFIG.paymentMethods[0],
        date: result.date || prev.date,
        merchant: result.merchant || '',
        invoice_number: result.invoice_number || '',
      }));

      if (!result.hasFields) {
        setStep('format_warning');
      } else {
        setStep('form');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Unable to analyze image. Please try another photo.');
      setErrorType('generic');
      setStep('error');
    }
  };

  /* ---------------- HANDLERS ---------------- */

  const handleCameraCapture = async () => {
    if (!(await ensurePermission('camera'))) return;

    try {
      const photo = await Camera.getPhoto({
        quality: 90,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
      });

      if (!photo.webPath) {
        throw new Error('No image URI');
      }

      await startProcessing(photo.webPath);
    } catch {
      setErrorMsg('Camera capture failed.');
      setErrorType('generic');
      setStep('error');
    }
  };

  const handleGalleryUpload = async () => {
    if (!(await ensurePermission('photos'))) return;

    try {
      const photo = await Camera.getPhoto({
        quality: 90,
        resultType: CameraResultType.Uri,
        source: CameraSource.Photos,
      });

      if (!photo.webPath) {
        throw new Error('No image URI');
      }

      await startProcessing(photo.webPath);
    } catch {
      setErrorMsg('Image selection failed.');
      setErrorType('generic');
      setStep('error');
    }
  };

  const handlePDFUploadChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 🚫 NO OCR FOR PDF (safe manual flow)
    const url = URL.createObjectURL(file);
    setImage(url);
    setStep('form');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    const success = await submitToGoogleForm(formData);
    setIsSubmitting(false);

    if (success) {
      setStep('success');
      setTimeout(onCancel, 1500);
    } else {
      alert('Submission failed. Check internet.');
    }
  };

  /* ---------------- UI ---------------- */

  if (step === 'select') {
    return (
      <div className="h-full flex flex-col p-6 gap-6">
        <Header title="Add Payment" onCancel={onCancel} />

        <button onClick={handleCameraCapture} className="h-48 border-4 border-dashed rounded-3xl">
          <CameraIcon size={32} /> Scan Receipt
        </button>

        <div className="grid grid-cols-2 gap-4">
          <button onClick={handleGalleryUpload}>
            <Upload /> Photos
          </button>

          <label>
            <FileText /> PDF
            <input type="file" accept="application/pdf" hidden onChange={handlePDFUploadChange} />
          </label>
        </div>
      </div>
    );
  }

  if (step === 'processing') {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={48} className="animate-spin" />
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center gap-4">
        <AlertCircle size={40} />
        <p>{errorMsg}</p>
        <button onClick={() => setStep('select')}>Try Again</button>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <Check size={48} />
        <p>Saved successfully</p>
      </div>
    );
  }

  /* ---------------- FORM ---------------- */

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4">
      {image && <img src={image} className="h-40 object-cover rounded-xl" />}

      <input
        placeholder="Amount"
        value={formData.amount}
        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
        required
      />

      <input
        placeholder="Merchant"
        value={formData.merchant}
        onChange={(e) => setFormData({ ...formData, merchant: e.target.value })}
      />

      <input
        type="date"
        value={formData.date}
        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
      />

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}

/* ---------------- HEADER ---------------- */

const Header = ({ title, onCancel }) => (
  <div className="flex justify-between items-center mb-4">
    <h2>{title}</h2>
    <button onClick={onCancel}>
      <X />
    </button>
  </div>
);
