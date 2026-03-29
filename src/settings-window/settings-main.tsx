/**
 * Settings window entrypoint - mounts the settings React app.
 */
import ReactDOM from 'react-dom/client';
import { SettingsApp } from './SettingsApp';
import '../index.css';

// Mount the settings app
ReactDOM.createRoot(document.getElementById('settings-root')!).render(<SettingsApp />);
