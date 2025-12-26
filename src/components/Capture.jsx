
import React, { useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { analyzeImage } from './utils/ocr'; // Adjust path if needed

const CaptureReceipt = () => {
  const [loading, setLoading] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [previewImage, setPreviewImage] = useState(null);

  const takePicture = async () => {
    setErrorMsg('');
    setReceiptData(null);

    try {
      // 1. Open Camera / Gallery
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false, // Set true if you want cropping
        resultType: CameraResultType.Uri, // ⚠️ CRITICAL: Must be Uri for OCR
        source: CameraSource.Prompt, // Allows user to choose Camera or Gallery
        saveToGallery: false
      });

      // 2. Set Preview immediately (for UI)
      setPreviewImage(image.webPath);
      setLoading(true);

      // 3. Prepare Path for OCR
      // Capacitor 3+: image.path is the native file path
      // If path is undefined (e.g. web), we cannot use the Native OCR plugin
      if (!image.path && Capacitor.isNativePlatform()) {
        throw new Error('Unable to resolve native file path. Try a different image.');
      }

      // 4. Run Analysis
      console.log('Sending path to OCR:', image.path);
      const data = await analyzeImage(image.path);
      
      setReceiptData(data);
      console.log('Analysis Complete:', data);

    } catch (error) {
      console.error('Capture Flow Error:', error);
      
      let uiMessage = 'Failed to analyze receipt.';
      
      if (error.message === 'permission') {
        uiMessage = 'Camera/Storage permission denied. Please enable them in settings.';
      } else if (error.message === 'file_not_found') {
        uiMessage = 'Could not read the image file. Please try again.';
      } else if (error.message.includes('cancelled')) {
        uiMessage = ''; // User cancelled, no error needed
      }

      if (uiMessage) setErrorMsg(uiMessage);
      
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h2>Scan Receipt</h2>
      
      {/* --- Error Banner --- */}
      {errorMsg && (
        <div style={{ background: '#ffcccc', color: '#cc0000', padding: '10px', marginBottom: '15px', borderRadius: '8px' }}>
          {errorMsg}
        </div>
      )}

      {/* --- Image Preview --- */}
      {previewImage && (
        <img 
          src={previewImage} 
          alt="Receipt Preview" 
          style={{ width: '100%', maxHeight: '300px', objectFit: 'contain', borderRadius: '10px', marginBottom: '20px' }} 
        />
      )}

      {/* --- Action Button --- */}
      <button 
        onClick={takePicture}
        disabled={loading}
        style={{
          padding: '15px 30px',
          fontSize: '18px',
          background: loading ? '#ccc' : '#6200ea',
          color: '#fff',
          border: 'none',
          borderRadius: '25px',
          cursor: loading ? 'wait' : 'pointer'
        }}
      >
        {loading ? 'Analyzing...' : 'Take Photo / Upload'}
      </button>

      {/* --- Results Display --- */}
      {receiptData && (
        <div style={{ marginTop: '20px', textAlign: 'left', background: '#f5f5f5', padding: '15px', borderRadius: '10px' }}>
          <h3>Results:</h3>
          <p><strong>Merchant:</strong> {receiptData.merchant || 'Unknown'}</p>
          <p><strong>Date:</strong> {receiptData.date}</p>
          <p><strong>Amount:</strong> {receiptData.amount ? `₹${receiptData.amount}` : 'Not found'}</p>
          <p><strong>Category:</strong> {receiptData.category}</p>
        </div>
      )}
    </div>
  );
};

export default CaptureReceipt;
