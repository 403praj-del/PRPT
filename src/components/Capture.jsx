import React, { useState, useEffect } from 'react';
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
    const [errorType, setErrorType] = useState(null); // 'permission', 'generic', 'unreadable'

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
                if (status.photos !== 'granted') {
                    const request = await Camera.requestPermissions({ permissions: ['photos'] });
                    if (request.photos !== 'granted') throw new Error('permission');
                }
            }
            return true;
        } catch (err) {
            console.error("Permission check/request failed:", err);
            setErrorMsg("Missing Permissions! The app cannot read images or access the camera. Please enable access in settings.");
            setErrorType('permission');
            setStep('error');
            return false;
        }
    };

    const startProcessing = async (imgSrc) => {
        if (!imgSrc) {
            setErrorMsg("No image data found. Please try again.");
            setStep('error');
            return;
        }

        setStep('processing');
        setErrorMsg('');
        try {
            const result = await analyzeImage(imgSrc);

            if (!result || (!result.amount && !result.merchant && !result.text)) {
                throw new Error("OCR returned no usable text. Ensure you're scanning a clear, well-lit receipt.");
            }

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
            console.error("Processing error:", err);
            setErrorMsg(err.message || "Failed to analyze image.");
            setErrorType('generic');
            setStep('error');
        }
    };

    // --- Handlers ---

    const handleCameraCapture = async () => {
        const hasPermission = await checkAndRequestPermissions('camera');
        if (!hasPermission) return;

        try {
            const photo = await Camera.getPhoto({
                quality: 60, // Lower quality for faster processing and less memory
                allowEditing: false,
                resultType: CameraResultType.Base64,
                source: CameraSource.Camera
            });

            if (!photo.base64String) throw new Error("unreadable");

            const base64Image = `data:image/${photo.format};base64,${photo.base64String}`;
            setImage(base64Image);
            startProcessing(base64Image);
        } catch (err) {
            if (err.message !== 'User cancelled photos app') {
                console.error("Camera capture failed:", err);
                setErrorMsg(err.message === 'unreadable' ? "Captured image is unreadable." : "Could not use camera.");
                setStep('error');
            }
        }
    };

    const handleGalleryUpload = async () => {
        const hasPermission = await checkAndRequestPermissions('photos');
        if (!hasPermission) return;

        try {
            const photo = await Camera.getPhoto({
                quality: 60,
                allowEditing: false,
                resultType: CameraResultType.Base64,
                source: CameraSource.Photos
            });

            if (!photo.base64String) throw new Error("unreadable");

            const base64Image = `data:image/${photo.format};base64,${photo.base64String}`;
            setImage(base64Image);
            startProcessing(base64Image);
        } catch (err) {
            if (err.message !== 'User cancelled photos app') {
                console.error("Gallery selection failed:", err);
                setErrorMsg(err.message === 'unreadable' ? "Selected image is empty or invalid." : "Could not read image from gallery.");
                setStep('error');
            }
        }
    };

    const handlePDFUploadChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setStep('processing');
        setErrorMsg('');
        try {
            // Check for potential corruption
            if (file.size === 0) throw new Error("Empty file selected.");

            // Use pdfjs to render first page
            const pdfjs = await import('pdfjs-dist');
            pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

            if (pdf.numPages === 0) throw new Error("This PDF contains no pages.");

            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 1.5 }); // Balanced scale for quality vs memory

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport }).promise;
            const imageSrc = canvas.toDataURL('image/jpeg', 0.8);

            if (!imageSrc || imageSrc.length < 100) throw new Error("Failed to render PDF page.");

            setImage(imageSrc);
            startProcessing(imageSrc);
        } catch (err) {
            console.error("PDF Processing Error:", err);
            setErrorMsg(err.message?.includes('render') ? "PDF Rendering failed. Try taking a screenshot instead." : "Could not read PDF file. It may be password protected or corrupted.");
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
            setTimeout(() => onCancel(), 2000);
        } else {
            alert("Connection error! Could not submit to Google Form. Please check your internet.");
        }
    };

    // --- Render Logic ---

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
                            <p className="text-xs text-text-muted mt-1">Capture with device camera</p>
                        </div>
                    </button>

                    <div className="grid grid-cols-2 gap-4 w-full">
                        <button
                            onClick={handleGalleryUpload}
                            className="h-36 rounded-2xl bg-surface border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 hover:border-secondary hover:bg-secondary/5 transition-all"
                        >
                            <Upload size={24} className="text-secondary" />
                            <span className="font-bold text-xs uppercase tracking-widest text-text">Photos</span>
                        </button>

                        <div className="relative">
                            <input
                                type="file"
                                accept="application/pdf"
                                className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                onChange={handlePDFUploadChange}
                            />
                            <button className="w-full h-36 rounded-2xl bg-surface border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 hover:border-accent hover:bg-accent/5 transition-all">
                                <FileText size={24} className="text-accent" />
                                <span className="font-bold text-xs uppercase tracking-widest text-text">PDF Document</span>
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
                <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse"></div>
                    <div className="relative z-10 w-24 h-24 rounded-full border-4 border-primary/20 border-t-primary animate-spin"></div>
                    <Sparkles size={32} className="absolute inset-0 m-auto text-primary animate-bounce-slow" />
                </div>
                <div>
                    <h3 className="text-xl font-black">AI Analyzing...</h3>
                    <p className="text-sm text-text-muted mt-2 animate-pulse">Extracting payment details locally</p>
                </div>
            </div>
        );
    }

    if (step === 'error') {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-surface p-8 text-center space-y-6 animate-fade-in">
                <div className="w-20 h-20 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center">
                    <AlertCircle size={40} />
                </div>
                <div className="space-y-2">
                    <h3 className="text-2xl font-black">{errorType === 'permission' ? 'Permission Error' : 'Analysis Failed'}</h3>
                    <p className="text-text-muted leading-relaxed">{errorMsg}</p>
                </div>

                <div className="w-full space-y-3 pt-4">
                    {errorType === 'permission' && (
                        <button
                            onClick={() => alert("Please open Phone Settings > Apps > Payment Tracker > Permissions and enable Camera and Files/Media.")}
                            className="w-full bg-primary text-white font-black py-4 rounded-2xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 active:scale-95"
                        >
                            <SettingsIcon size={20} />
                            Check Permissions
                        </button>
                    )}
                    <button
                        onClick={() => setStep('select')}
                        className="w-full bg-background border-2 border-border text-text font-bold py-4 rounded-2xl active:scale-95"
                    >
                        Try Another Way
                    </button>
                </div>
            </div>
        );
    }

    if (step === 'success') {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-surface p-12 text-center space-y-4">
                <div className="w-24 h-24 bg-secondary/20 text-secondary rounded-full flex items-center justify-center animate-bounce-short">
                    <Check size={48} />
                </div>
                <h2 className="text-3xl font-black tracking-tight">SUCCESS!</h2>
                <p className="text-text-muted">Payment added to Google Sheet.</p>
            </div>
        );
    }

    // Default: Form Step
    return (
        <div className="h-full flex flex-col bg-surface animate-slide-up overflow-hidden">
            <Header onCancel={onCancel} title="Confirm Expense" />

            <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-28">
                {analysisData && (
                    <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 flex gap-4 animate-fade-in">
                        <div className="w-12 h-12 bg-primary/20 text-primary rounded-xl flex items-center justify-center shrink-0">
                            <Sparkles size={24} />
                        </div>
                        <div className="text-xs">
                            <p className="font-black text-primary uppercase tracking-wider text-xs">AI Extraction Result</p>
                            <p className="text-text-muted mt-1 leading-normal">
                                Amount: <strong>₹{analysisData.amount || 'N/A'}</strong> • Date: <strong>{analysisData.date || 'Today'}</strong>
                                <br />Merchant: <strong>{analysisData.merchant || 'Unknown'}</strong>
                            </p>
                        </div>
                    </div>
                )}

                <div className="space-y-6">
                    {image && (
                        <div className="h-56 w-full rounded-2xl overflow-hidden relative group border-2 border-border shadow-md">
                            <img src={image} alt="Receipt" className="w-full h-full object-cover" />
                            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent flex items-end p-4">
                                <button
                                    onClick={() => setStep('select')}
                                    className="ml-auto p-2 bg-white/20 hover:bg-white/40 text-white rounded-full backdrop-blur-md active:scale-90 transition-all"
                                >
                                    <RefreshCw size={20} />
                                </button>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">Amount</label>
                            <div className="relative">
                                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-3xl font-black text-text-muted">₹</span>
                                <input
                                    type="text"
                                    value={formData.amount}
                                    onChange={e => setFormData({ ...formData, amount: e.target.value })}
                                    placeholder="0.00"
                                    className="w-full bg-background border-2 border-border rounded-2xl pl-12 pr-4 py-5 text-4xl font-black focus:border-primary transition-all shadow-sm"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">Category</label>
                                <select
                                    value={formData.category}
                                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                                    className="w-full bg-background border-2 border-border rounded-2xl p-4 font-black text-sm uppercase focus:border-primary transition-all appearance-none"
                                >
                                    {FORM_CONFIG.categories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">Method</label>
                                <select
                                    value={formData.method}
                                    onChange={e => setFormData({ ...formData, method: e.target.value })}
                                    className="w-full bg-background border-2 border-border rounded-2xl p-4 font-black text-sm uppercase focus:border-primary transition-all appearance-none"
                                >
                                    {FORM_CONFIG.paymentMethods.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">Merchant</label>
                            <input
                                type="text"
                                value={formData.merchant}
                                onChange={e => setFormData({ ...formData, merchant: e.target.value })}
                                placeholder="Where did you spend?"
                                className="w-full bg-background border-2 border-border rounded-2xl p-4 font-bold focus:border-primary transition-all shadow-sm"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">Date</label>
                                <input
                                    type="date"
                                    value={formData.date}
                                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                                    className="w-full bg-background border-2 border-border rounded-2xl p-4 font-bold text-sm focus:border-primary transition-all"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">Ref #</label>
                                <input
                                    type="text"
                                    value={formData.invoice_number}
                                    onChange={e => setFormData({ ...formData, invoice_number: e.target.value })}
                                    placeholder="Optional"
                                    className="w-full bg-background border-2 border-border rounded-2xl p-4 font-bold text-sm focus:border-primary transition-all"
                                />
                            </div>
                        </div>

                        <div className="fixed bottom-0 left-0 right-0 p-6 bg-surface border-t border-border z-30">
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full bg-primary text-white font-black py-5 rounded-2xl shadow-2xl shadow-primary/40 flex items-center justify-center gap-3 active:scale-95 transition-all text-xl uppercase tracking-widest disabled:opacity-50"
                            >
                                {isSubmitting ? <Loader2 className="animate-spin" /> : <>Upload Entry <Sparkles size={20} /></>}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

const Header = ({ onCancel, title }) => (
    <div className="p-5 flex justify-between items-center bg-surface border-b border-border sticky top-0 z-40">
        <h2 className="font-black text-2xl tracking-tight uppercase tracking-widest">{title}</h2>
        <button onClick={onCancel} className="p-3 bg-background hover:bg-border rounded-full transition-all active:rotate-90">
            <X size={24} />
        </button>
    </div>
);
