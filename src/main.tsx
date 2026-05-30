/**
 * Client entrypoint that mounts the React app and global styles.
 */
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './index.css';

// Mount the app once the root element is available.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
