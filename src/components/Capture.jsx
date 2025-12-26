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
  Settings as SettingsIcon
} from 'lucide-react';

import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { analyzeImage } from '../services/ocr';
import { submitToGoogleForm } from '../services/api';
import { FORM_CONFIG } from '../config/constants';

export default function Capture({ onCancel }) {
  const [step, setStep] = useState('select'); // select | processing | form | success | error | format_warning
  const [image, setImage] = useState(null);
  const [analysisData, setAnalysisData] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [errorType, setErrorType] = useState(null);

  const [formData, setFormData] = useState({
    amount: '',
    category: FORM_CONFIG.categories[0],
    method: FORM_CONFIG.paymentMethods[0],
    date: new Date().toISOString().split('T')[0],
    merchant: '',
    invoice_number: ''
  });

  /* -------------------------------------------------------
     PERMISSIONS
  ------------------------------------------------------- */
  const checkAndRequestPermissions = async (type) => {
    try {
      const status = await Camera.checkPermissions();

      if (type === 'camera' && status.camera !== 'granted') {
        const req = await Camera.requestPermissions({ permissions: ['camera'] });
        if (req.camera !== 'granted') throw new Error('permission');
      }

      if (type === 'photos' && status.photos !== 'granted') {
        const req = await Camera.requestPermissions({ permissions: ['photos'] });
        if (req.photos !== 'granted') throw new Error('permission');
      }

      return true;
    } catch {
      setErrorType('permission');
      setErrorMsg(
        'Permission required. Please allow camera and media access in app settings.'
      );
      setStep('error');
      return false;
    }
  };

  /* -------------------------------------------------------
     IMAGE NORMALIZATION (CRITICAL FOR OCR)
  ------------------------------------------------------- */
  const normalizeImage = (base64) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1280;
        let w = img.width;
        let h = img.height;

        if (w > MAX) {
          h = Math.round((h * MAX) / w);
          w = MAX;
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        // mild enhancement
        ctx.filter = 'brightness(1.1) contrast(1.15)';
        ctx.drawImage(canvas, 0, 0);

        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };

      img.onerror = () => resolve(base64);
      img.src = base64;
    });

  /* -------------------------------------------------------
     URI → OCR PIPELINE (FIXES ML KIT FAILURES)
  ------------------------------------------------------- */
  const processFromUri = async (uri) => {
    try {
      setStep('processing');

      const res = await fetch(uri);
      const blob = await res.blob();

      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });

      const normalized = await normalizeImage(base64);
      setImage(normalized);

      const result = await analyzeImage(normalized);
      setAnalysisData(result);

      setFormData((prev) => ({
        ...prev,
        amount: result.amount || '',
        category: result.category || FORM_CONFIG.categories[0],
        method: result.payment_method || FORM_CONFIG.paymentMethods[0],
        date: result.date || prev.date,
        merchant: result.merchant || '',
        invoice_number: result.invoice_number || ''
      }));

      if (!result.hasFields) {
        setStep('format_warning');
      } else {
        setStep('form');
      }
    } catch (e) {
      console.error(e);
      setErrorType('generic');
      setErrorMsg('Failed to process image. Please try a clearer photo.');
      setStep('error');
    }
  };

  /* -------------------------------------------------------
     CAMERA & GALLERY
  ------------------------------------------------------- */
  const handleCameraCapture = async () => {
    if (!(await checkAndRequestPermissions('camera'))) return;

    try {
      const photo = await Camera.getPhoto({
        quality: 90,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera
      });

      await processFromUri(photo.webPath);
    } catch {
      setErrorMsg('Camera capture failed.');
      setStep('error');
    }
  };

  const handleGalleryUpload = async () => {
    if (!(await checkAndRequestPermissions('photos'))) return;

    try {
      const photo = await Camera.getPhoto({
        quality: 90,
        resultType: CameraResultType.Uri,
        source: CameraSource.Photos
      });

      await processFromUri(photo.webPath);
    } catch {
      setErrorMsg('Gallery selection failed.');
      setStep('error');
    }
  };

  /* -------------------------------------------------------
     PDF (DISABLED SAFELY)
  ------------------------------------------------------- */
  const handlePDFUploadChange = () => {
    setErrorType('generic');
    setErrorMsg('PDF OCR is temporarily disabled. Please upload an image.');
    setStep('error');
  };

  /* -------------------------------------------------------
     SUBMIT
  ------------------------------------------------------- */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    const success = await submitToGoogleForm(formData);
    setIsSubmitting(false);

    if (success) {
      setStep('success');
      setTimeout(onCancel, 1500);
    } else {
      alert('Submission failed. Please check your internet.');
    }
  };

  /* -------------------------------------------------------
     UI STATES
  ------------------------------------------------------- */

  if (step === 'select') {
    return (
      <div className="h-full flex flex-col p-6 gap-6">
        <Header onCancel={onCancel} title="Add Payment" />

        <button onClick={handleCameraCapture} className="h-52 border-dashed border-4 rounded-3xl">
          <CameraIcon size={32} /> Scan Receipt
        </button>

        <div className="grid grid-cols-2 gap-4">
          <button onClick={handleGalleryUpload}>
            <Upload /> Photos
          </button>

          <div className="relative">
            <input type="file" accept="application/pdf" className="absolute inset-0 opacity-0" onChange={handlePDFUploadChange} />
            <button>
              <FileText /> PDF
            </button>
          </div>
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

  if (step === 'format_warning') {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center">
        <AlertCircle size={40} />
        <p>Text detected but format not recognized.</p>
        <button onClick={() => setStep('form')}>Fill Manually</button>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center">
        <AlertCircle size={40} />
        <p>{errorMsg}</p>
        <button onClick={() => setStep('select')}>Try Again</button>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="h-full flex items-center justify-center">
        <Check size={48} /> Saved
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4">
      {image && <img src={image} className="h-40 object-cover rounded-xl" />}
      <input value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} placeholder="Amount" />
      <button type="submit">{isSubmitting ? 'Saving...' : 'Save'}</button>
    </form>
  );
}

/* -------------------------------------------------------
   HEADER
------------------------------------------------------- */
const Header = ({ onCancel, title }) => (
  <div className="flex justify-between items-center">
    <h2>{title}</h2>
    <button onClick={onCancel}><X /></button>
  </div>
);
