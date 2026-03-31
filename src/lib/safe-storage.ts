// safe-storage.ts

/**
 * Safely parse JSON from local storage with error handling.
 * @param key The key to retrieve from local storage.
 * @returns Parsed object or null if the key does not exist or parsing fails.
 */
function safeParseLocalStorage(key: string): any {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : null;
    } catch (e) {
        console.error('Error parsing localStorage key "' + key + '":', e);
        return null;
    }
}

export { safeParseLocalStorage };