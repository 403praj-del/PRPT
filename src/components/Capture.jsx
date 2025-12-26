import React, { useState, useRef } from 'react';
import { X, Upload, Camera as CameraIcon, Check, RefreshCw, Loader2, Sparkles, AlertCircle, FileText, Settings as SettingsIcon } from 'lucide-react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { analyzeImage } from '../services/ocr';
import { submitToGoogleForm } from '../services/api';
import { FORM_CONFIG } from '../config/constants';

export default function Capture({ onCancel }) {
    const [step, setStep] = useState('select'); // select, processing, form, success, error
    const [image, setImage] = useState(null);
    const [formData, setFormData] = useState({
        amount: '',
        category: FORM_CONFIG.categories[0],
        method: FORM_CONFIG.paymentMethods[0],
        date: new Date().toISOString().split('T')[0],
        merchant: '',
        invoice_number: ''
    });
    const [analysisData, setAnalysisData] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [errorType, setErrorType] = useState(null); // 'permission', 'generic'

    // --- Helpers ---

    const checkAndRequestPermissions = async (type = 'camera') => {
        try {
            const status = await Camera.checkPermissions();
            console.log(`Permission status for ${type}:`, status);

            if (type === 'camera') {
                if (status.camera !== 'granted') {
                    const request = await Camera.requestPermissions({ permissions: ['camera'] });
                    if (request.camera !== 'granted') throw new Error('permission');
                }
            } else if (type === 'photos') {
                // On Android 13+, photos permission is separate. status.photos handles this.
                if (status.photos !== 'granted') {
                    const request = await Camera.requestPermissions({ permissions: ['photos'] });
                    if (request.photos !== 'granted') throw new Error('permission');
                }
            }

            return true;
        } catch (err) {
            console.error("Permission check/request failed:", err);
            setErrorMsg("Camera or Gallery access denied. Please enable it in system settings to scan receipts.");
            setErrorType('permission');
            setStep('error');
            return false;
        }
    };

    const startProcessing = async (imgSrc) => {
        setStep('processing');
        setErrorMsg('');
        try {
            const result = await analyzeImage(imgSrc);
            setAnalysisData(result);
            setFormData(prev => ({
                ...prev,
                amount: result.amount || "",
                category: result.category || FORM_CONFIG.categories[0],
                method: result.payment_method || FORM_CONFIG.paymentMethods[0],
                date: result.date || new Date().toISOString().split('T')[0],
                merchant: result.merchant || "",
                invoice_number: result.invoice_number || ""
            }));
            setStep('form');
        } catch (err) {
            setErrorMsg(err.message || "Failed to analyze image.");
            setStep('error');
        }
    };

    // --- Handlers ---

    const handleCameraCapture = async () => {
        const hasPermission = await checkAndRequestPermissions('camera');
        if (!hasPermission) return;

        try {
            const photo = await Camera.getPhoto({
                quality: 90,
                allowEditing: false,
                resultType: CameraResultType.Base64,
                source: CameraSource.Camera
            });

            const base64Image = `data:image/${photo.format};base64,${photo.base64String}`;
            setImage(base64Image);
            startProcessing(base64Image);
        } catch (err) {
            if (err.message !== 'User cancelled photos app') {
                console.error("Camera error:", err);
                setErrorMsg("Could not use camera. Try uploading an image instead.");
                setStep('error');
            }
        }
    };

    const handleGalleryUpload = async () => {
        const hasPermission = await checkAndRequestPermissions('photos');
        if (!hasPermission) return;

        try {
            const photo = await Camera.getPhoto({
                quality: 90,
                allowEditing: false,
                resultType: CameraResultType.Base64,
                source: CameraSource.Photos
            });

            const base64Image = `data:image/${photo.format};base64,${photo.base64String}`;
            setImage(base64Image);
            startProcessing(base64Image);
        } catch (err) {
            if (err.message !== 'User cancelled photos app') {
                console.error("Gallery error:", err);
                setErrorMsg("Could not read image from gallery.");
                setStep('error');
            }
        }
    };

    const handleFileUploadChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.type === 'application/pdf') {
            setStep('processing');
            setErrorMsg('');
            try {
                const pdfjs = await import('pdfjs-dist');
                pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
                const page = await pdf.getPage(1);
                const viewport = page.getViewport({ scale: 2.0 });

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                await page.render({ canvasContext: context, viewport }).promise;
                const imageSrc = canvas.toDataURL('image/jpeg');
                setImage(imageSrc);
                startProcessing(imageSrc);
            } catch (err) {
                console.error("PDF Load error:", err);
                setErrorMsg("Failed to read PDF file.");
                setStep('error');
            }
        } else {
            // Standard image file input fallback (rarely used if gallery works)
            const reader = new FileReader();
            reader.onloadend = () => {
                setImage(reader.result);
                startProcessing(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        const success = await submitToGoogleForm(formData);
        setIsSubmitting(false);
        if (success) {
            setStep('success');
            setTimeout(() => {
                onCancel();
            }, 2000);
        } else {
            alert("Failed to submit. Please try again.");
        }
    };

    // --- Render ---

    if (step === 'select') {
        return (
            <div className="h-full flex flex-col animate-slide-up bg-surface">
                <Header onCancel={onCancel} title="New Entry" />
                <div className="flex-1 flex flex-col p-6 items-center justify-center gap-6">
                    <button
                        onClick={handleCameraCapture}
                        className="w-full h-48 rounded-2xl bg-surface border-2 border-dashed border-border flex flex-col items-center justify-center gap-4 hover:border-primary hover:bg-surface/50 transition-all group"
                    >
                        <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                            <CameraIcon size={32} />
                        </div>
                        <div>
                            <span className="font-semibold text-text block">Take Photo</span>
                            <p className="text-xs text-text-muted mt-1 text-center">Scan physical receipts</p>
                        </div>
                    </button>

                    <div className="grid grid-cols-2 gap-4 w-full">
                        <button
                            onClick={handleGalleryUpload}
                            className="h-32 rounded-2xl bg-surface border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 hover:border-secondary hover:bg-surface/50 transition-all group"
                        >
                            <Upload size={24} className="text-secondary" />
                            <span className="font-medium text-sm text-text">Gallery</span>
                        </button>

                        <div className="relative">
                            <input
                                type="file"
                                accept="application/pdf"
                                className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                onChange={handleFileUploadChange}
                            />
                            <button className="w-full h-32 rounded-2xl bg-surface border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 hover:border-accent hover:bg-surface/50 transition-all group">
                                <FileText size={24} className="text-accent" />
                                <span className="font-medium text-sm text-text">Upload PDF</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (step === 'processing') {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-surface animate-fade-in space-y-4">
                <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse"></div>
                    <Sparkles size={48} className="text-primary relative z-10 animate-spin-slow" />
                </div>
                <div className="text-center">
                    <p className="text-lg font-bold">Scanning Receipt</p>
                    <p className="text-sm text-text-muted animate-pulse">Processing locally with ML Kit...</p>
                </div>
            </div>
        );
    }

    if (step === 'error') {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-surface animate-fade-in space-y-4 p-8 text-center">
                <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center">
                    <AlertCircle size={32} />
                </div>
                <h3 className="text-xl font-bold">{errorType === 'permission' ? 'Permission Required' : 'Analysis Failed'}</h3>
                <p className="text-sm text-text-muted">{errorMsg}</p>

                <div className="flex flex-col gap-3 w-full mt-4">
                    {errorType === 'permission' ? (
                        <button
                            onClick={() => alert("Please go to Settings > Apps > Payment Tracker > Permissions and enable Camera & Photos.")}
                            className="bg-primary text-white font-semibold px-6 py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-primary/20 transition-all active:scale-95"
                        >
                            <SettingsIcon size={18} />
                            Check Permissions
                        </button>
                    ) : null}
                    <button
                        onClick={() => {
                            setStep('select');
                            setErrorType(null);
                        }}
                        className="bg-background border border-border text-text font-medium px-6 py-3 rounded-xl hover:bg-surface transition-colors"
                    >
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    if (step === 'success') {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-surface animate-fade-in space-y-4">
                <div className="w-20 h-20 bg-secondary/20 text-secondary rounded-full flex items-center justify-center animate-bounce">
                    <Check size={40} />
                </div>
                <h2 className="text-2xl font-bold">Expense Saved!</h2>
            </div>
        );
    }

    // Form Step (step === 'form')
    return (
        <div className="h-full flex flex-col bg-surface animate-slide-up">
            <Header onCancel={onCancel} title="Confirm Details" />

            <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-24">
                {analysisData && (
                    <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                            <Sparkles size={20} />
                        </div>
                        <div className="text-xs">
                            <p className="font-bold text-primary text-sm">OCR Scan Result</p>
                            <p className="text-text-muted mt-1 leading-relaxed">
                                Detected <strong>{analysisData.amount ? `₹${analysisData.amount}` : 'No Amount'}</strong> on <strong>{analysisData.date || 'unknown date'}</strong>. Merchant identified as <strong>{analysisData.merchant || 'unknown'}</strong>.
                            </p>
                        </div>
                    </div>
                )}

                {image && (
                    <div className="h-48 w-full rounded-2xl overflow-hidden relative group border-2 border-border shadow-inner">
                        <img src={image} alt="Receipt" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent flex items-end p-4">
                            <button
                                onClick={() => setStep('select')}
                                className="ml-auto p-2 bg-white/20 hover:bg-white/40 text-white rounded-full backdrop-blur-md transition-all active:scale-95"
                            >
                                <RefreshCw size={18} />
                            </button>
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-text-muted uppercase tracking-wider">Amount (INR)</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-text-muted">₹</span>
                            <input
                                type="text"
                                value={formData.amount}
                                onChange={e => setFormData({ ...formData, amount: e.target.value })}
                                placeholder="0.00"
                                className="w-full bg-background border-2 border-border rounded-2xl pl-10 pr-4 py-5 text-3xl font-black focus:outline-none focus:border-primary transition-all shadow-sm"
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-text-muted uppercase tracking-wider">Category</label>
                            <select
                                value={formData.category}
                                onChange={e => setFormData({ ...formData, category: e.target.value })}
                                className="w-full bg-background border-2 border-border rounded-xl p-4 font-bold text-sm focus:outline-none focus:border-primary shadow-sm appearance-none"
                            >
                                {FORM_CONFIG.categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-text-muted uppercase tracking-wider">Method</label>
                            <select
                                value={formData.method}
                                onChange={e => setFormData({ ...formData, method: e.target.value })}
                                className="w-full bg-background border-2 border-border rounded-xl p-4 font-bold text-sm focus:outline-none focus:border-primary shadow-sm appearance-none"
                            >
                                {FORM_CONFIG.paymentMethods.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-text-muted uppercase tracking-wider">Merchant</label>
                        <input
                            type="text"
                            value={formData.merchant}
                            onChange={e => setFormData({ ...formData, merchant: e.target.value })}
                            placeholder="Store / Vendor name"
                            className="w-full bg-background border-2 border-border rounded-xl p-4 font-bold focus:outline-none focus:border-primary shadow-sm"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-text-muted uppercase tracking-wider">Date</label>
                            <input
                                type="date"
                                value={formData.date}
                                onChange={e => setFormData({ ...formData, date: e.target.value })}
                                className="w-full bg-background border-2 border-border rounded-xl p-4 font-bold text-sm focus:outline-none focus:border-primary shadow-sm"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-text-muted uppercase tracking-wider">Invoice #</label>
                            <input
                                type="text"
                                value={formData.invoice_number}
                                onChange={e => setFormData({ ...formData, invoice_number: e.target.value })}
                                placeholder="Ref #"
                                className="w-full bg-background border-2 border-border rounded-xl p-4 font-bold text-sm focus:outline-none focus:border-primary shadow-sm"
                            />
                        </div>
                    </div>

                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full bg-primary hover:bg-primary-dark text-white font-black py-5 rounded-2xl shadow-xl shadow-primary/30 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3 text-lg uppercase tracking-widest"
                        >
                            {isSubmitting ? <Loader2 className="animate-spin" /> : <>Submit to Sheet <Check size={20} /></>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

const Header = ({ onCancel, title }) => (
    <div className="p-4 flex justify-between items-center bg-surface border-b border-border sticky top-0 z-20">
        <h2 className="font-black text-xl tracking-tight">{title}</h2>
        <button onClick={onCancel} className="p-2 bg-background hover:bg-border rounded-full transition-all active:scale-90">
            <X size={20} />
        </button>
    </div>
);
