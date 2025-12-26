import React, { useState, useEffect } from 'react';
import { Camera } from '@capacitor/camera';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Capture from './components/Capture';
import Settings from './components/Settings';

function App() {
  const [currentTab, setCurrentTab] = useState('home');

  useEffect(() => {
    // Attempt to pre-request permissions on first launch for a smoother experience
    const initPermissions = async () => {
      try {
        const status = await Camera.checkPermissions();
        // Comprehensive check for Camera and Photos
        if (status.camera !== 'granted' || status.photos !== 'granted') {
          console.log("Requesting permissions on launch...");
          await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
        }
      } catch (err) {
        console.warn("Initial permission request skipped or failed:", err);
      }
    };
    initPermissions();
  }, []);

  const renderContent = () => {
    switch (currentTab) {
      case 'home':
        return <Dashboard onCapture={() => setCurrentTab('capture')} />;
      case 'capture':
        return <Capture onCancel={() => setCurrentTab('home')} />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard onCapture={() => setCurrentTab('capture')} />;
    }
  };

  return (
    <Layout currentTab={currentTab} onTabChange={setCurrentTab}>
      {renderContent()}
    </Layout>
  );
}

export default App;
