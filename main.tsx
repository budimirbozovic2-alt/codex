// Updated main.tsx

import { ImportColorTheme } from './themes';
import { App } from './App';

// Function to bootstrap the application
const bootstrapApp = async () => {
    await Promise.all([
        ImportColorTheme(),
        createRoot(document.getElementById('root'))
    ]);

    // Initial rendering of the application
    render(<App />, document.getElementById('root'));

    // Background stream-based backup building
    queueMicrotask(() => {
        // Implement backup logic here
    });
};

bootstrapApp();