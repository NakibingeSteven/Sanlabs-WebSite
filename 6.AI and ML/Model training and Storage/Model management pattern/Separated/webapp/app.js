// =============================================
// ESP32 FILE DOWNLOADER - Modular JavaScript
// =============================================

class FileDownloaderManager {
    constructor() {
        this.currentStorage = 'flash';
        this.currentCategory = 'all';
        this.storageInfo = null;
        this.downloadedFiles = new Map();
        this.allFiles = [];
        this.db = null;
        this.isOnline = true;
        this.showCategories = false;
        
        this.initializeIndexedDB();
        this.init();
    }

    // =============================================
    // INDEXEDDB MANAGEMENT
    // =============================================

    async initializeIndexedDB() {
        try {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open('ESP32FileManager', 2);
                
                request.onerror = () => {
                    console.error('IndexedDB error:', request.error);
                    this.showStatus('IndexedDB initialization failed', 'error');
                    reject(request.error);
                };
                
                request.onsuccess = () => {
                    this.db = request.result;
                    this.showStatus('Storage system initialized', 'success');
                    this.loadDownloadedFiles().then(resolve);
                };
                
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    
                    // Create downloads store with enhanced schema
                    if (!db.objectStoreNames.contains('downloads')) {
                        const store = db.createObjectStore('downloads', { keyPath: 'id' });
                        store.createIndex('filename', 'filename', { unique: false });
                        store.createIndex('storage', 'storage', { unique: false });
                        store.createIndex('category', 'category', { unique: false });
                        store.createIndex('downloadedAt', 'downloadedAt', { unique: false });
                    }

                    // Create settings store
                    if (!db.objectStoreNames.contains('settings')) {
                        const settingsStore = db.createObjectStore('settings', { keyPath: 'key' });
                    }
                };
            });
        } catch (error) {
            console.error('Error initializing IndexedDB:', error);
            this.showStatus('Storage initialization failed', 'error');
        }
    }

    async loadDownloadedFiles() {
        if (!this.db) return;
        
        try {
            const transaction = this.db.transaction(['downloads'], 'readonly');
            const store = transaction.objectStore('downloads');
            const request = store.getAll();
            
            return new Promise((resolve) => {
                request.onsuccess = () => {
                    this.downloadedFiles.clear();
                    request.result.forEach(item => {
                        this.downloadedFiles.set(item.id, {
                            filename: item.filename,
                            downloadedAt: item.downloadedAt,
                            storage: item.storage,
                            category: item.category || 'general',
                            size: item.size || 0
                        });
                    });
                    console.log(`Loaded ${this.downloadedFiles.size} downloaded files from IndexedDB`);
                    this.updateDownloadStats();
                    resolve();
                };
                
                request.onerror = () => {
                    console.error('Error loading downloaded files');
                    resolve();
                };
            });
        } catch (error) {
            console.error('Error in loadDownloadedFiles:', error);
        }
    }

    async markFileAsDownloaded(fileId, filename, data, storage, size, category = 'general') {
        if (!this.db) return;
        
        try {
            const transaction = this.db.transaction(['downloads'], 'readwrite');
            const store = transaction.objectStore('downloads');
            
            const fileRecord = {
                id: fileId,
                filename: filename,
                downloadedAt: new Date().toISOString(),
                storage: storage,
                category: category,
                size: size,
                data: data
            };
            
            await new Promise((resolve, reject) => {
                const request = store.put(fileRecord);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
            
            this.downloadedFiles.set(fileId, {
                filename: filename,
                downloadedAt: fileRecord.downloadedAt,
                storage: storage,
                category: category,
                size: size
            });
            
            this.updateDownloadStats();
            
        } catch (error) {
            console.error('Error marking file as downloaded:', error);
        }
    }

    async clearDownloads() {
        if (!this.db) {
            this.showStatus('Database not available', 'error');
            return;
        }
        
        if (!confirm('Are you sure you want to clear all downloaded files?')) {
            return;
        }
        
        try {
            const transaction = this.db.transaction(['downloads'], 'readwrite');
            const store = transaction.objectStore('downloads');
            
            await new Promise((resolve, reject) => {
                const request = store.clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
            
            this.downloadedFiles.clear();
            this.showStatus('All downloads cleared successfully', 'success');
            this.refreshFileList();
            this.updateDownloadStats();
            
        } catch (error) {
            console.error('Error clearing downloads:', error);
            this.showStatus('Error clearing downloads: ' + error.message, 'error');
        }
    }

    // =============================================
    // INITIALIZATION AND CONNECTION
    // =============================================

    async init() {
        await this.checkConnection();
        if (this.isOnline) {
            await this.loadStorageInfo();
        }
        await this.refreshFileList();
        this.updateSystemStats();
        this.setupEventListeners();
        
        // Update stats every 5 seconds
        setInterval(() => this.updateSystemStats(), 5000);
    }

    async checkConnection() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            const response = await fetch('/api/storage', { 
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            this.isOnline = response.ok;
            
            if (this.isOnline) {
                this.showStatus('Connected to ESP32', 'success');
            }
        } catch (error) {
            this.isOnline = false;
            this.showStatus('ESP32 not connected - using offline mode', 'info');
        }
    }

    setupEventListeners() {
        // Category filter buttons
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const category = btn.dataset.category;
                this.selectCategory(category);
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch(e.key) {
                    case 'r':
                        e.preventDefault();
                        this.refreshFiles();
                        break;
                    case 'd':
                        e.preventDefault();
                        this.clearDownloads();
                        break;
                }
            }
        });
    }

    // =============================================
    // STORAGE AND FILE MANAGEMENT
    // =============================================

    async loadStorageInfo() {
        if (!this.isOnline) {
            this.showStorageOffline();
            return;
        }
        
        try {
            const response = await fetch('/api/storage');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            this.storageInfo = await response.json();
            
            const sdBtn = document.getElementById('sdBtn');
            const flashBtn = document.getElementById('flashBtn');
            
            if (this.storageInfo.sd.available) {
                sdBtn.disabled = false;
                sdBtn.innerHTML = `💿 SD Card (${this.formatBytes(this.storageInfo.sd.free)} free)`;
            } else {
                sdBtn.disabled = true;
                sdBtn.innerHTML = '💿 SD Card (Not Available)';
            }
            
            flashBtn.innerHTML = `💾 Flash Storage (${this.formatBytes(this.storageInfo.flash.free)} free)`;
            
        } catch (error) {
            console.error('Error loading storage info:', error);
            this.showStatus('Error loading storage info: ' + error.message, 'error');
            this.showStorageOffline();
        }
    }

    showStorageOffline() {
        const sdBtn = document.getElementById('sdBtn');
        const flashBtn = document.getElementById('flashBtn');
        
        sdBtn.disabled = true;
        sdBtn.innerHTML = '💿 SD Card (Offline)';
        flashBtn.innerHTML = '💾 Flash Storage (Offline)';
    }

    async selectStorage(storage) {
        this.currentStorage = storage;
        
        // Update button states
        document.querySelectorAll('.storage-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.getElementById(storage + 'Btn').classList.add('active');
        
        await this.refreshFileList();
    }

    selectCategory(category) {
        this.currentCategory = category;
        
        // Update button states
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-category="${category}"]`).classList.add('active');
        
        this.filterFiles();
    }

    toggleCategory() {
        this.showCategories = !this.showCategories;
        const categoryFilter = document.getElementById('categoryFilter');
        
        if (this.showCategories) {
            categoryFilter.style.display = 'block';
        } else {
            categoryFilter.style.display = 'none';
            this.selectCategory('all');
        }
    }

    filterFiles() {
        const fileItems = document.querySelectorAll('.file-item');
        
        fileItems.forEach(item => {
            const category = item.dataset.category || 'general';
            
            if (this.currentCategory === 'all' || category === this.currentCategory) {
                item.classList.remove('hidden');
            } else {
                item.classList.add('hidden');
            }
        });
    }

    async refreshFileList() {
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = '<div class="loading">Loading files...</div>';
        
        if (!this.isOnline) {
            this.showOfflineFiles();
            return;
        }
        
        try {
            const response = await fetch(`/api/files?location=${this.currentStorage}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data.success) {
                fileList.innerHTML = '<div class="status error">Failed to load files from ' + this.currentStorage + '</div>';
                return;
            }
            
            this.allFiles = data.files;
            this.renderFileList(data.files);
            
        } catch (error) {
            console.error('Error loading files:', error);
            fileList.innerHTML = `<div class="status error">Error loading files: ${error.message}</div>`;
            
            // Show offline files as fallback
            setTimeout(() => this.showOfflineFiles(), 2000);
        }
    }

    showOfflineFiles() {
        if (this.downloadedFiles.size === 0) {
            document.getElementById('fileList').innerHTML = 
                '<div class="empty-state"><h3>📭 No Files Available</h3><p>No files available offline. Connect to ESP32 to download files.</p></div>';
            return;
        }

        const offlineFiles = Array.from(this.downloadedFiles.entries())
            .filter(([id, info]) => info.storage === this.currentStorage)
            .map(([id, info]) => ({
                name: info.filename,
                size: info.size,
                path: id.split(':')[1],
                category: info.category,
                isOffline: true
            }));

        if (offlineFiles.length === 0) {
            document.getElementById('fileList').innerHTML = 
                `<div class="empty-state"><h3>📂 No ${this.currentStorage.toUpperCase()} Files</h3><p>No ${this.currentStorage} files available offline.</p></div>`;
            return;
        }

        this.allFiles = offlineFiles;
        this.renderFileList(offlineFiles, true);
    }

    renderFileList(files, isOffline = false) {
        const fileList = document.getElementById('fileList');
        
        if (files.length === 0) {
            fileList.innerHTML = `<div class="empty-state"><h3>📂 No Files Found</h3><p>No files found in ${this.currentStorage.toUpperCase()} storage</p></div>`;
            return;
        }
        
        let html = `<h3>📁 Files in ${this.currentStorage.toUpperCase()} Storage ${isOffline ? '(Offline Mode)' : ''}:</h3>`;
        
        // Group files by category
        const filesByCategory = this.groupFilesByCategory(files);
        
        Object.keys(filesByCategory).forEach(category => {
            const categoryFiles = filesByCategory[category];
            const categoryIcon = this.getCategoryIcon(category);
            
            html += `<div class="category-section">`;
            if (Object.keys(filesByCategory).length > 1) {
                html += `<h4 style="margin: 20px 0 10px 0; color: #666; font-size: 1.1rem;">${categoryIcon} ${category.toUpperCase()}</h4>`;
            }
            
            categoryFiles.forEach(file => {
                const fileId = `${this.currentStorage}:${file.path}`;
                const isDownloaded = this.downloadedFiles.has(fileId);
                const downloadInfo = this.downloadedFiles.get(fileId);
                
                html += `
                    <div class="file-item ${isDownloaded ? 'downloaded' : ''}" data-category="${file.category || 'general'}">
                        <div class="file-info">
                            <div class="file-name">${file.name}</div>
                            <div class="file-size">${this.formatBytes(file.size)}</div>
                            <div class="file-path">${file.path}</div>
                            <span class="file-category ${file.category || 'general'}">${file.category || 'general'}</span>
                            ${isDownloaded ? `<div class="file-path">Downloaded: ${new Date(downloadInfo.downloadedAt).toLocaleString()}</div>` : ''}
                        </div>
                        <button class="download-btn" 
                                onclick="fileDownloader.downloadFile('${file.path}', '${file.name}', ${file.size}, '${file.category || 'general'}')"
                                ${isDownloaded ? 'disabled' : ''}>
                            ${isDownloaded ? '✅ Downloaded' : (isOffline ? '📥 Re-download' : '⬇️ Download')}
                        </button>
                    </div>
                `;
            });
            
            html += `</div>`;
        });
        
        fileList.innerHTML = html;
        
        // Apply current category filter
        if (this.showCategories) {
            this.filterFiles();
        }
    }

    groupFilesByCategory(files) {
        const groups = {};
        
        files.forEach(file => {
            const category = file.category || 'general';
            if (!groups[category]) {
                groups[category] = [];
            }
            groups[category].push(file);
        });
        
        return groups;
    }

    getCategoryIcon(category) {
        const icons = {
            documents: '📄',
            images: '🖼️',
            configs: '⚙️',
            simulations: '🧪',
            general: '📁'
        };
        return icons[category] || '📁';
    }

    // =============================================
    // FILE DOWNLOAD
    // =============================================

    async downloadFile(filePath, filename, fileSize = 0, category = 'general') {
        const fileId = `${this.currentStorage}:${filePath}`;
        
        if (this.downloadedFiles.has(fileId)) {
            this.showStatus(`${filename} is already downloaded`, 'info');
            return;
        }
        
        if (!this.isOnline) {
            this.showStatus('Cannot download - ESP32 not connected', 'error');
            return;
        }
        
        try {
            this.showStatus(`📥 Downloading ${filename}...`, 'info');
            
            const response = await fetch(`/api/download?location=${this.currentStorage}&file=${encodeURIComponent(filePath)}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const blob = await response.blob();
            const data = await blob.arrayBuffer();
            
            // Save to IndexedDB
            await this.markFileAsDownloaded(fileId, filename, data, this.currentStorage, blob.size, category);
            
            // Create download link for user
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            
            // Cleanup
            setTimeout(() => {
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }, 100);
            
            this.showStatus(`✅ Successfully downloaded ${filename} (${this.formatBytes(blob.size)})`, 'success');
            this.refreshFileList();
            
        } catch (error) {
            console.error('Download error:', error);
            this.showStatus(`❌ Error downloading ${filename}: ${error.message}`, 'error');
        }
    }

    // =============================================
    // STATS AND UI UPDATES
    // =============================================

    async updateSystemStats() {
        if (!this.isOnline) {
            this.showOfflineStats();
            return;
        }
        
        try {
            const response = await fetch('/api/stats');
            if (!response.ok) return;
            
            const stats = await response.json();
            
            document.getElementById('uptimeValue').textContent = this.formatUptime(stats.uptime);
            document.getElementById('clientsValue').textContent = stats.connected_clients;
            document.getElementById('requestsValue').textContent = stats.request_count;
            document.getElementById('memoryValue').textContent = this.formatBytes(stats.free_heap);
            
        } catch (error) {
            this.showOfflineStats();
        }
    }

    showOfflineStats() {
        document.getElementById('uptimeValue').textContent = 'Offline';
        document.getElementById('clientsValue').textContent = '--';
        document.getElementById('requestsValue').textContent = '--';
        document.getElementById('memoryValue').textContent = '--';
    }

    updateDownloadStats() {
        const totalFiles = this.downloadedFiles.size;
        const totalSize = Array.from(this.downloadedFiles.values())
            .reduce((sum, file) => sum + (file.size || 0), 0);
        
        const totalDownloadsEl = document.getElementById('totalDownloads');
        const totalSizeEl = document.getElementById('totalSize');
        
        if (totalDownloadsEl) totalDownloadsEl.textContent = totalFiles;
        if (totalSizeEl) totalSizeEl.textContent = this.formatBytes(totalSize);
    }

    showStorageInfo() {
        let info = `📊 Storage Information:\n\n`;
        
        if (this.storageInfo && this.isOnline) {
            info += `Flash Storage:\n`;
            info += `  Total: ${this.formatBytes(this.storageInfo.flash.total)}\n`;
            info += `  Used: ${this.formatBytes(this.storageInfo.flash.used)}\n`;
            info += `  Free: ${this.formatBytes(this.storageInfo.flash.free)}\n\n`;
            
            if (this.storageInfo.sd.available) {
                info += `SD Card:\n`;
                info += `  Total: ${this.formatBytes(this.storageInfo.sd.total)}\n`;
                info += `  Used: ${this.formatBytes(this.storageInfo.sd.used)}\n`;
                info += `  Free: ${this.formatBytes(this.storageInfo.sd.free)}\n\n`;
            }
        }
        
        info += `Downloaded Files: ${this.downloadedFiles.size}\n`;
        
        const totalDownloadSize = Array.from(this.downloadedFiles.values())
            .reduce((total, file) => total + (file.size || 0), 0);
        info += `Local Storage Used: ${this.formatBytes(totalDownloadSize)}\n\n`;
        
        // Category breakdown
        const categories = {};
        this.downloadedFiles.forEach(file => {
            const cat = file.category || 'general';
            categories[cat] = (categories[cat] || 0) + 1;
        });
        
        if (Object.keys(categories).length > 0) {
            info += `Files by Category:\n`;
            Object.entries(categories).forEach(([cat, count]) => {
                info += `  ${cat}: ${count} files\n`;
            });
        }
        
        alert(info);
    }

    showStatus(message, type = 'success') {
        const statusDiv = document.getElementById('statusMessage');
        statusDiv.innerHTML = `<div class="status ${type}">${message}</div>`;
        
        // Auto-hide after duration based on type
        const timeout = type === 'error' ? 8000 : type === 'warning' ? 6000 : 5000;
        setTimeout(() => {
            if (statusDiv.innerHTML.includes(message)) {
                statusDiv.innerHTML = '';
            }
        }, timeout);
    }

    // =============================================
    // UTILITY FUNCTIONS
    // =============================================

    formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    formatUptime(seconds) {
        if (!seconds) return '0s';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours}h ${minutes}m ${secs}s`;
    }

    // =============================================
    // PUBLIC METHODS FOR GLOBAL ACCESS
    // =============================================

    refreshFiles() {
        this.refreshFileList();
        this.loadStorageInfo();
        this.showStatus('Files refreshed', 'success');
    }

    async reconnect() {
        this.showStatus('Attempting to reconnect...', 'info');
        await this.checkConnection();
        if (this.isOnline) {
            await this.init();
            this.showStatus('Reconnected successfully!', 'success');
        } else {
            this.showStatus('Still offline - check ESP32 connection', 'warning');
        }
    }
}

// =============================================
// GLOBAL INSTANCE AND EVENT HANDLERS
// =============================================

let fileDownloader;

// Initialize when DOM is loaded
window.addEventListener('DOMContentLoaded', async () => {
    try {
        fileDownloader = new FileDownloaderManager();
        console.log('File Downloader initialized successfully');
    } catch (error) {
        console.error('Error initializing file downloader:', error);
        document.getElementById('statusMessage').innerHTML = 
            '<div class="status error">Failed to initialize application: ' + error.message + '</div>';
    }
});

// Global functions for HTML onclick handlers
function selectStorage(storage) {
    if (fileDownloader) {
        fileDownloader.selectStorage(storage);
    }
}

function refreshFiles() {
    if (fileDownloader) {
        fileDownloader.refreshFiles();
    }
}

function clearDownloads() {
    if (fileDownloader) {
        fileDownloader.clearDownloads();
    }
}

function showStorageInfo() {
    if (fileDownloader) {
        fileDownloader.showStorageInfo();
    }
}

function toggleCategory() {
    if (fileDownloader) {
        fileDownloader.toggleCategory();
    }
}

function reconnect() {
    if (fileDownloader) {
        fileDownloader.reconnect();
    }
}

// =============================================
// NETWORK EVENT HANDLERS
// =============================================

// Handle online/offline events
window.addEventListener('online', () => {
    if (fileDownloader) {
        fileDownloader.isOnline = true;
        fileDownloader.init();
        fileDownloader.showStatus('Internet connection restored', 'success');
    }
});

window.addEventListener('offline', () => {
    if (fileDownloader) {
        fileDownloader.isOnline = false;
        fileDownloader.showStatus('Working in offline mode', 'info');
    }
});

// Handle page visibility changes (for mobile)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && fileDownloader) {
        // Page became visible, check connection
        setTimeout(() => {
            fileDownloader.checkConnection();
        }, 1000);
    }
});

// =============================================
// SERVICE WORKER REGISTRATION (Optional)
// =============================================

// Uncomment to enable service worker for offline caching
/*
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('SW registered: ', registration);
            })
            .catch((registrationError) => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}
*/

// =============================================
// ERROR HANDLING
// =============================================

// Global error handler
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    if (fileDownloader) {
        fileDownloader.showStatus('An unexpected error occurred', 'error');
    }
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    if (fileDownloader) {
        fileDownloader.showStatus('Network or storage error occurred', 'warning');
    }
    event.preventDefault();
});

// =============================================
// DEVELOPMENT HELPERS
// =============================================

// Add console commands for debugging
if (typeof window !== 'undefined') {
    window.debugFileDownloader = {
        getStats: () => {
            if (!fileDownloader) return 'Not initialized';
            return {
                isOnline: fileDownloader.isOnline,
                currentStorage: fileDownloader.currentStorage,
                downloadedFiles: fileDownloader.downloadedFiles.size,
                storageInfo: fileDownloader.storageInfo
            };
        },
        
        clearStorage: async () => {
            if (!fileDownloader) return 'Not initialized';
            await fileDownloader.clearDownloads();
            return 'Storage cleared';
        },
        
        reconnect: async () => {
            if (!fileDownloader) return 'Not initialized';
            await fileDownloader.reconnect();
            return 'Reconnect attempted';
        }
    };
}

console.log(`
🚀 ESP32 File Downloader Loaded
📱 Features: Download tracking, offline mode, category filtering
🔧 Debug commands available at window.debugFileDownloader
⌨️  Keyboard shortcuts: Ctrl+R (refresh), Ctrl+D (clear downloads)
`);