import React, { useState } from 'react';
import {
  X,
  Upload,
  Camera as CameraIcon,
  FileText,
  AlertCircle,
  Loader2,
  Check
} from 'lucide-react';

import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { analyzeImage } from '../services/ocr';
import { submitToGoogleForm } from '../services/api';
import { FORM_CONFIG } from '../config/constants';

export default function Capture({ onCancel }) {
  const [step, setStep] = useState('select'); // select | processing | form | success | error
  const [image, setImage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [formData, setFormData] = useState({
    amount: '',
    category: FORM_CONFIG.categories[0],
    method: FORM_CONFIG.paymentMethods[0],
    date: new Date().toISOString().split('T')[0],
    merchant: '',
    invoice_number: ''
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
      setErrorMsg('Permission required. Please allow access in settings.');
      setStep('error');
      return false;
    }
  };

  /* ---------------- IMAGE PIPELINE ---------------- */

  const processFromUri = async (uri) => {
    try {
      setStep('processing');

      // Fetch image
      const res = await fetch(uri);
      const blob = await res.blob();

      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });

      setImage(base64);

      // SAFE OCR (stub)
      await analyzeImage(base64);

      // Always allow manual entry
      setStep('form');
    } catch (e) {
      console.error(e);
      setErrorMsg('Failed to process image.');
      setStep('error');
    }
  };

  /* ---------------- HANDLERS ---------------- */

  const handleCamera = async () => {
    if (!(await ensurePermission('camera'))) return;
    const photo = await Camera.getPhoto({
      quality: 85,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera
    });
    processFromUri(photo.webPath);
  };

  const handleGallery = async () => {
    if (!(await ensurePermission('photos'))) return;
    const photo = await Camera.getPhoto({
      quality: 85,
      resultType: CameraResultType.Uri,
      source: CameraSource.Photos
    });
    processFromUri(photo.webPath);
  };

  const handlePdf = () => {
    setErrorMsg('PDF OCR is temporarily disabled. Please upload an image.');
    setStep('error');
  };

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

  /* ---------------- UI ---------------- */

  if (step === 'select') {
    return (
      <div className="p-6 space-y-6">
        <Header onCancel={onCancel} title="Add Expense" />

        <button onClick={handleCamera} className="h-48 border-4 border-dashed rounded-3xl">
          <CameraIcon size={32} /> Scan Receipt
        </button>

        <div className="grid grid-cols-2 gap-4">
          <button onClick={handleGallery}>
            <Upload /> Gallery
          </button>

          <button onClick={handlePdf}>
            <FileText /> PDF
          </button>
        </div>
      </div>
    );
  }

  if (step === 'processing') {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin" size={48} />
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
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
        onChange={e => setFormData({ ...formData, amount: e.target.value })}
        required
      />

      <input
        placeholder="Merchant"
        value={formData.merchant}
        onChange={e => setFormData({ ...formData, merchant: e.target.value })}
      />

      <input
        type="date"
        value={formData.date}
        onChange={e => setFormData({ ...formData, date: e.target.value })}
      />

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
}

/* ---------------- HEADER ---------------- */

const Header = ({ onCancel, title }) => (
  <div className="flex justify-between items-center mb-4">
    <h2>{title}</h2>
    <button onClick={onCancel}>
      <X />
    </button>
  </div>
);
