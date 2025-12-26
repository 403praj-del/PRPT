import React, { useState, useEffect } from 'react';
import { Camera } from '@capacitor/camera';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Capture from './components/Capture';
import Settings from './components/Settings';

function App() {
  const [currentTab, setCurrentTab] = useState('home');

  useEffect(() => {
    const initPermissions = async () => {
      try {
        // 1️⃣ Check existing permissions
        const status = await Camera.checkPermissions();
        console.log('[Permissions] Current:', status);

        const needCamera =
          status.camera !== 'granted';

        const needPhotos =
          status.photos !== 'granted' &&
          status.photos !== 'limited'; // Android 13+ case

        // 2️⃣ Request only if needed
        if (needCamera || needPhotos) {
          console.log('[Permissions] Requesting camera/photos...');
          const result = await Camera.requestPermissions({
            permissions: ['camera', 'photos'],
          });
          console.log('[Permissions] Result:', result);
        }
      } catch (err) {
        // Do NOT block app on permission failure
        console.warn('[Permissions] Init skipped:', err);
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
