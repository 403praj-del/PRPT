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
  const [image, setImage] = useState(null);
  const [formData, setFormData] = useState({
    amount: '',
    category: FORM_CONFIG.categories[0],
    method: FORM_CONFIG.paymentMethods[0],
    date: new Date().toISOString().split('T')[0],
    merchant: '',
    invoice_number: '',
  });
  const [analysisData, setAnalysisData] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [errorType, setErrorType] = useState(null); // 'permission', 'generic', 'prep'

  // ---------- Helpers ----------

  const normalizeImage = (base64) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const MAX_WIDTH = 1280;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.filter = 'brightness(1.1) contrast(1.15)';
        tempCtx.drawImage(canvas, 0, 0);

        resolve(tempCanvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(base64);
      img.src = base64;
    });
  };

  const checkAndRequestPermissions = async (type) => {
    try {
      const status = await Camera.checkPermissions();
      if (type === 'camera' && status.camera !== 'granted') {
        const req = await Camera.requestPermissions({ permissions: ['camera'] });
        if (req.camera !== 'granted') throw new Error('permission');
      } else if (type === 'photos' && status.photos !== 'granted') {
        const req = await Camera.requestPermissions({ permissions: ['photos'] });
        if (req.photos !== 'granted') throw new Error('permission');
      }
      return true;
    } catch (err) {
      setErrorMsg(
        'Permission Required: The app cannot access the camera or files. Please enable access in settings.',
      );
      setErrorType('permission');
      setStep('error');
      return false;
    }
  };

  const startProcessing = async (src) => {
    setStep('processing');
    setErrorMsg('');
    try {
      let preview = src;

      if (src.startsWith('data:')) {
        preview = await normalizeImage(src);
      }

      setImage(preview);

      const result = await analyzeImage(src);
      setAnalysisData(result);

      setFormData((prev) => ({
        ...prev,
        amount: result.amount || '',
        category: result.category || FORM_CONFIG.categories[0],
        method: result.payment_method || FORM_CONFIG.paymentMethods[0],
        date: result.date || new Date().toISOString().split('T')[0],
        merchant: result.merchant || '',
        invoice_number: result.invoice_number || '',
      }));

      if (!result.hasFields) {
        setStep('format_warning');
      } else {
        setStep('form');
      }
    } catch (err) {
      console.error('Processing error:', err);
      const msg = err.message || 'Failed to analyze image.';
      setErrorMsg(msg);
      setErrorType(msg.includes('prepare') ? 'prep' : 'generic');
      setStep('error');
    }
  };

  // ---------- Handlers ----------

  const handleCameraCapture = async () => {
    if (!(await checkAndRequestPermissions('camera'))) return;
    try {
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
      });

      console.log('Camera photo:', photo);
      const path = photo.path || photo.webPath; // fallback
      if (!path) {
        throw new Error('Unable to get image path from camera.');
      }

      await startProcessing(path);
    } catch (err) {
      if (err.message !== 'User cancelled photos app') {
        setErrorMsg('Unable to prepare image for analysis.');
        setErrorType('generic');
        setStep('error');
      }
    }
  };

  const handleGalleryUpload = async () => {
    if (!(await checkAndRequestPermissions('photos'))) return;
    try {
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Photos,
      });

      console.log('Gallery photo:', photo);
      const path = photo.path || photo.webPath;
      if (!path) {
        throw new Error('Unable to get image path from gallery.');
      }

      await startProcessing(path);
    } catch (err) {
      if (err.message !== 'User cancelled photos app') {
        setErrorMsg('Unable to prepare image for analysis.');
        setErrorType('generic');
        setStep('error');
      }
    }
  };

  const handlePDFUploadChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStep('processing');
    setErrorMsg('');
    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);

      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport }).promise;

      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      await startProcessing(dataUrl);
    } catch (err) {
      console.error('PDF error:', err);
      setErrorMsg('PDF not supported or corrupted.');
      setErrorType('generic');
      setStep('error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    const success = await submitToGoogleForm(formData);
    setIsSubmitting(false);
    if (success) {
      setStep('success');
      setTimeout(() => onCancel(), 1500);
    } else {
      alert('Submission error! Check internet.');
    }
  };

  // ---------- Render ----------

  if (step === 'select') {
    return (
      <div className="h-full flex flex-col bg-surface overflow-hidden">
        <Header onCancel={onCancel} title="Add Payment" />
        <div className="flex-1 flex flex-col p-6 items-center justify-center gap-6">
          <button
            onClick={handleCameraCapture}
            className="w-full h-52 rounded-3xl bg-surface border-4 border-dashed border-border flex flex-col items-center justify-center gap-4 hover:border-primary hover:bg-primary/5 transition-all group"
          >
            <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
              <CameraIcon size={32} />
            </div>
            <div className="text-center">
              <span className="font-bold text-lg block">Scan Receipt</span>
              <p className="text-xs text-text-muted mt-1">
                Capture with device camera
              </p>
            </div>
          </button>

          <div className="grid grid-cols-2 gap-4 w-full">
            <button
              onClick={handleGalleryUpload}
              className="h-36 rounded-2xl bg-surface border-2 border-dashed border-border flex flex-col items-center justify-center gap-2"
            >
              <Upload size={24} className="text-secondary" />
              <span className="font-bold text-xs uppercase text-text">
                Photos
              </span>
            </button>

            <div className="relative">
              <input
                type="file"
                accept="application/pdf"
                className="absolute inset-0 opacity-0 cursor-pointer z-10"
                onChange={handlePDFUploadChange}
              />
              <button className="w-full h-36 rounded-2xl bg-surface border-2 border-dashed border-border flex flex-col items-center justify-center gap-2">
                <FileText size={24} className="text-accent" />
                <span className="font-bold text-xs uppercase text-text">
                  PDF Document
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'processing') {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-surface p-12 text-center space-y-6">
        <Loader2 size={48} className="text-primary animate-spin" />
        <div>
          <h3 className="text-xl font-black">Normalizing Input...</h3>
          <p className="text-sm text-text-muted mt-2">
            Preparing high-res OCR scan
          </p>
        </div>
      </div>
    );
  }

  if (step === 'format_warning') {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-surface p-8 text-center space-y-6">
        <div className="w-20 h-20 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center">
          <AlertCircle size={40} />
        </div>
        <div className="space-y-2">
          <h3 className="text-2xl font-black text-amber-600">
            Format Unrecognized
          </h3>
          <p className="text-text-muted">
            Text detected, but receipt format not recognized. Please fill in
            details manually.
          </p>
        </div>
        <button
          onClick={() => setStep('form')}
          className="w-full bg-primary text-white font-black py-4 rounded-2xl shadow-xl shadow-primary/20 active:scale-95 transition-all text-xl"
        >
          Fill Manually
        </button>
        <button
          onClick={() => setStep('select')}
          className="text-xs font-bold uppercase text-text-muted border-b border-border"
        >
          Try Another Image
        </button>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-surface p-8 text-center space-y-6">
        <div className="w-20 h-20 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center">
          <AlertCircle size={40} />
        </div>
        <h3 className="text-2xl font-black">
          {errorType === 'permission' ? 'Access Denied' : 'OCR Error'}
        </h3>
        <p className="text-text-muted leading-relaxed">{errorMsg}</p>
        <div className="w-full space-y-3">
          {errorType === 'permission' && (
            <button
              onClick={() =>
                alert(
                  'Open App Info > Permissions > Allow Camera/Storage',
                )
              }
              className="w-full bg-primary text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2"
            >
              <SettingsIcon size={20} /> Open Settings
            </button>
          )}
          <button
            onClick={() => setStep('select')}
            className="w-full bg-background border-2 border-border text-text font-bold py-4 rounded-2xl"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-surface p-12 text-center space-y-4">
        <div className="w-24 h-24 bg-secondary/20 text-secondary rounded-full flex items-center justify-center animate-bounce">
          <Check size={48} />
        </div>
        <h2 className="text-3xl font-black">RECORDED!</h2>
        <p className="text-text-muted">Data synced to Google Sheet.</p>
      </div>
    );
  }

  // form
  return (
    <div className="h-full flex flex-col bg-surface overflow-hidden">
      <Header onCancel={onCancel} title="Confirm Expense" />
      <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-28">
        {image && image.startsWith('data:') && (
          <img
            src={image}
            className="h-48 w-full object-cover rounded-2xl border-2 border-border"
            alt="Scan"
          />
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">
              Amount
            </label>
            <div className="relative">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-3xl font-black text-text-muted">
                ₹
              </span>
              <input
                type="text"
                value={formData.amount}
                onChange={(e) =>
                  setFormData({ ...formData, amount: e.target.value })
                }
                placeholder="0.00"
                className="w-full bg-background border-2 border-border rounded-2xl pl-12 pr-4 py-5 text-4xl font-black focus:border-primary transition-all shadow-sm"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">
                Category
              </label>
              <select
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
                className="w-full bg-background border-2 border-border rounded-2xl p-4 font-black text-sm uppercase appearance-none"
              >
                {FORM_CONFIG.categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">
                Method
              </label>
              <select
                value={formData.method}
                onChange={(e) =>
                  setFormData({ ...formData, method: e.target.value })
                }
                className="w-full bg-background border-2 border-border rounded-2xl p-4 font-black text-sm uppercase appearance-none"
              >
                {FORM_CONFIG.paymentMethods.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">
              Merchant
            </label>
            <input
              type="text"
              value={formData.merchant}
              onChange={(e) =>
                setFormData({ ...formData, merchant: e.target.value })
              }
              placeholder="Vendor Name"
              className="w-full bg-background border-2 border-border rounded-2xl p-4 font-bold shadow-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">
                Date
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) =>
                  setFormData({ ...formData, date: e.target.value })
                }
                className="w-full bg-background border-2 border-border rounded-2xl p-4 font-bold text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">
                Ref #
              </label>
              <input
                type="text"
                value={formData.invoice_number}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    invoice_number: e.target.value,
                  })
                }
                placeholder="Bill ID"
                className="w-full bg-background border-2 border-border rounded-2xl p-4 font-bold text-sm"
              />
            </div>
          </div>

          <div className="fixed bottom-0 left-0 right-0 p-6 bg-surface border-t border-border z-30">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-primary text-white font-black py-5 rounded-2xl shadow-primary/40 flex items-center justify-center gap-3 active:scale-95 transition-all text-xl uppercase tracking-widest"
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <>
                  Finalize Entry <Sparkles size={20} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const Header = ({ onCancel, title }) => (
  <div className="p-5 flex justify-between items-center bg-surface border-b border-border sticky top-0 z-40">
    <h2 className="font-black text-2xl tracking-tight uppercase tracking-widest">
      {title}
    </h2>
    <button
      onClick={onCancel}
      className="p-3 bg-background hover:bg-border rounded-full transition-all active:rotate-90"
    >
      <X size={24} />
    </button>
  </div>
);
