/*********
  Modular ESP32 File Download Server
  Based on Random Nerd Tutorials ESP32 Async Web Server
  Reusable pattern for file serving with storage selection
*********/

#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include <SD.h>
#include <SPI.h>
#include <ArduinoJson.h>

// Pin definitions
#define SD_CS_PIN 5
#define LED_PIN 2

// Network configuration
const char *ap_ssid = "FileServer-ESP32";
const char *ap_password = "fileserver2024";

// Create AsyncWebServer object
AsyncWebServer server(80);

// System variables
bool sdCardAvailable = false;
int connectedClients = 0;
unsigned long startTime;
unsigned long requestCount = 0;

// =============================================
// STORAGE MODULE - Reusable storage functions
// =============================================

class StorageManager
{
public:
    static bool initializeStorage()
    {
        bool flashOk = LittleFS.begin();
        bool sdOk = SD.begin(SD_CS_PIN);

        if (flashOk)
            Serial.println("✓ Flash storage initialized");
        else
            Serial.println("✗ Flash storage failed");

        if (sdOk)
        {
            Serial.println("✓ SD Card initialized");
            sdCardAvailable = true;
        }
        else
        {
            Serial.println("⚠ SD Card not available");
            sdCardAvailable = false;
        }

        return flashOk;
    }

    static String getStorageInfo()
    {
        DynamicJsonDocument doc(512);

        // Flash storage info
        JsonObject flash = doc.createNestedObject("flash");
        flash["available"] = true;
        flash["total"] = LittleFS.totalBytes();
        flash["used"] = LittleFS.usedBytes();
        flash["free"] = LittleFS.totalBytes() - LittleFS.usedBytes();

        // SD card info
        JsonObject sd = doc.createNestedObject("sd");
        sd["available"] = sdCardAvailable;
        if (sdCardAvailable)
        {
            sd["total"] = SD.totalBytes();
            sd["used"] = SD.usedBytes();
            sd["free"] = SD.totalBytes() - SD.usedBytes();
        }

        String output;
        serializeJson(doc, output);
        return output;
    }

    static String listFiles(String location, String path = "/")
    {
        DynamicJsonDocument doc(4096);
        JsonArray files = doc.createNestedArray("files");
        doc["location"] = location;
        doc["path"] = path;
        doc["success"] = false;

        if (location == "flash")
        {
            File root = LittleFS.open(path);
            if (root && root.isDirectory())
            {
                doc["success"] = true;
                File file = root.openNextFile();
                while (file)
                {
                    if (!file.isDirectory())
                    {
                        JsonObject fileObj = files.createNestedObject();
                        String filename = String(file.name());
                        if (filename.startsWith("/"))
                            filename = filename.substring(1);
                        fileObj["name"] = filename;
                        fileObj["size"] = file.size();
                        fileObj["path"] = String(file.name());
                    }
                    file = root.openNextFile();
                }
            }
        }
        else if (location == "sd" && sdCardAvailable)
        {
            File root = SD.open(path);
            if (root && root.isDirectory())
            {
                doc["success"] = true;
                File file = root.openNextFile();
                while (file)
                {
                    if (!file.isDirectory())
                    {
                        JsonObject fileObj = files.createNestedObject();
                        String filename = String(file.name());
                        if (filename.startsWith("/"))
                            filename = filename.substring(1);
                        fileObj["name"] = filename;
                        fileObj["size"] = file.size();
                        fileObj["path"] = String(file.name());
                    }
                    file = root.openNextFile();
                }
            }
        }

        String output;
        serializeJson(doc, output);
        return output;
    }

    static bool fileExists(String location, String path)
    {
        if (location == "flash")
        {
            return LittleFS.exists(path);
        }
        else if (location == "sd" && sdCardAvailable)
        {
            return SD.exists(path);
        }
        return false;
    }

    static File openFile(String location, String path)
    {
        if (location == "flash")
        {
            return LittleFS.open(path, "r");
        }
        else if (location == "sd" && sdCardAvailable)
        {
            return SD.open(path, FILE_READ);
        }
        return File();
    }
};

// =============================================
// WEB SERVER MODULE - Reusable server functions
// =============================================

class WebServerManager
{
public:
    static void setupRoutes()
    {
        // Main download page
        server.on("/", HTTP_GET, [](AsyncWebServerRequest *request)
                  {
      updateActivity();
      request->send_P(200, "text/html", getDownloadPageHTML()); });

        // API: Get storage information
        server.on("/api/storage", HTTP_GET, [](AsyncWebServerRequest *request)
                  {
      updateActivity();
      String json = StorageManager::getStorageInfo();
      request->send(200, "application/json", json); });

        // API: List files from specific location
        server.on("/api/files", HTTP_GET, [](AsyncWebServerRequest *request)
                  {
      updateActivity();
      String location = "flash"; // default
      if (request->hasParam("location")) {
        location = request->getParam("location")->value();
      }
      String path = "/";
      if (request->hasParam("path")) {
        path = request->getParam("path")->value();
      }
      String json = StorageManager::listFiles(location, path);
      request->send(200, "application/json", json); });

        // API: Download file
        server.on("/api/download", HTTP_GET, [](AsyncWebServerRequest *request)
                  {
      updateActivity();
      if (!request->hasParam("location") || !request->hasParam("file")) {
        request->send(400, "application/json", "{\"error\":\"Missing parameters\"}");
        return;
      }
      
      String location = request->getParam("location")->value();
      String filePath = request->getParam("file")->value();
      
      if (!StorageManager::fileExists(location, filePath)) {
        request->send(404, "application/json", "{\"error\":\"File not found\"}");
        return;
      }
      
      File file = StorageManager::openFile(location, filePath);
      if (!file) {
        request->send(500, "application/json", "{\"error\":\"Cannot open file\"}");
        return;
      }
      
      // Get filename for download
      String filename = filePath;
      int lastSlash = filePath.lastIndexOf('/');
      if (lastSlash >= 0) {
        filename = filePath.substring(lastSlash + 1);
      }
      
      AsyncWebServerResponse *response = request->beginResponse(
        getContentType(filename), 
        file.size(),
        [file](uint8_t *buffer, size_t maxLen, size_t index) mutable -> size_t {
          return file.read(buffer, maxLen);
        }
      );
      
      response->addHeader("Content-Disposition", "attachment; filename=\"" + filename + "\"");
      request->send(response);
      file.close(); });

        // API: System stats
        server.on("/api/stats", HTTP_GET, [](AsyncWebServerRequest *request)
                  {
      updateActivity();
      String json = getSystemStats();
      request->send(200, "application/json", json); });

        server.onNotFound([](AsyncWebServerRequest *request)
                          {
      updateActivity();
      request->send(404, "text/plain", "Not found"); });
    }

    static void updateActivity()
    {
        requestCount++;
    }

private:
    static String getContentType(String filename)
    {
        if (filename.endsWith(".html"))
            return "text/html";
        else if (filename.endsWith(".css"))
            return "text/css";
        else if (filename.endsWith(".js"))
            return "application/javascript";
        else if (filename.endsWith(".json"))
            return "application/json";
        else if (filename.endsWith(".png"))
            return "image/png";
        else if (filename.endsWith(".jpg"))
            return "image/jpeg";
        else if (filename.endsWith(".txt"))
            return "text/plain";
        return "application/octet-stream";
    }

    static String getSystemStats()
    {
        DynamicJsonDocument doc(512);
        doc["uptime"] = (millis() - startTime) / 1000;
        doc["connected_clients"] = WiFi.softAPgetStationNum();
        doc["request_count"] = requestCount;
        doc["free_heap"] = ESP.getFreeHeap();
        doc["timestamp"] = millis();

        String output;
        serializeJson(doc, output);
        return output;
    }
};

// =============================================
// HTML TEMPLATE MODULE - Reusable web interface
// =============================================

const char *getDownloadPageHTML()
{
    static const char html[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
    <title>ESP32 File Downloader</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f0f2f5; }
        .container { max-width: 1000px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: #1976d2; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { padding: 20px; }
        .storage-selector { margin: 20px 0; }
        .storage-btn { background: #4caf50; color: white; border: none; padding: 10px 20px; margin: 5px; border-radius: 4px; cursor: pointer; }
        .storage-btn:hover { background: #45a049; }
        .storage-btn.active { background: #1976d2; }
        .storage-btn:disabled { background: #ccc; cursor: not-allowed; }
        .file-list { margin: 20px 0; }
        .file-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; border: 1px solid #ddd; margin: 5px 0; border-radius: 4px; background: #f9f9f9; }
        .file-info { flex-grow: 1; }
        .file-name { font-weight: bold; }
        .file-size { color: #666; font-size: 0.9em; }
        .download-btn { background: #2196f3; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
        .download-btn:hover { background: #1976d2; }
        .download-btn:disabled { background: #ccc; cursor: not-allowed; }
        .downloaded { background: #e8f5e8 !important; }
        .status { padding: 10px; margin: 10px 0; border-radius: 4px; }
        .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .loading { text-align: center; padding: 20px; color: #666; }
        .stats { background: #e3f2fd; padding: 15px; border-radius: 4px; margin: 15px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>ESP32 File Downloader</h1>
            <p>Download files from ESP32 storage to your device</p>
        </div>
        
        <div class="content">
            <div class="stats">
                <strong>System Status:</strong>
                <span id="systemStats">Loading...</span>
            </div>
            
            <div class="storage-selector">
                <h3>Select Storage Location:</h3>
                <button id="flashBtn" class="storage-btn active" onclick="selectStorage('flash')">Flash Storage</button>
                <button id="sdBtn" class="storage-btn" onclick="selectStorage('sd')" disabled>SD Card (Not Available)</button>
            </div>
            
            <div id="fileList" class="file-list">
                <div class="loading">Loading files...</div>
            </div>
            
            <div id="statusMessage"></div>
        </div>
    </div>

    <script src="/js/fileDownloader.js"></script>
</body>
</html>
)rawliteral";
    return html;
}

// =============================================
// MAIN SETUP AND LOOP
// =============================================

void setup()
{
    Serial.begin(115200);
    pinMode(LED_PIN, OUTPUT);

    Serial.println("\n=== ESP32 File Server Starting ===");

    // Initialize storage
    if (!StorageManager::initializeStorage())
    {
        Serial.println("Critical: Flash storage initialization failed!");
        return;
    }

    // Create WiFi Access Point
    WiFi.softAP(ap_ssid, ap_password);
    IPAddress IP = WiFi.softAPIP();
    Serial.print("✓ Access Point IP: ");
    Serial.println(IP);

    startTime = millis();

    // Setup web server routes
    WebServerManager::setupRoutes();

    // Serve the JavaScript file
    server.on("/js/fileDownloader.js", HTTP_GET, [](AsyncWebServerRequest *request)
              {
    WebServerManager::updateActivity();
    request->send_P(200, "application/javascript", getFileDownloaderJS()); });

    // Start server
    server.begin();
    Serial.println("✓ Server started");

    // Ready indicator
    for (int i = 0; i < 3; i++)
    {
        digitalWrite(LED_PIN, HIGH);
        delay(200);
        digitalWrite(LED_PIN, LOW);
        delay(200);
    }
}

void loop()
{
    // Heartbeat LED
    static unsigned long lastBlink = 0;
    if (millis() - lastBlink > 1000)
    {
        digitalWrite(LED_PIN, !digitalRead(LED_PIN));
        lastBlink = millis();
    }

    // Print status every 30 seconds
    static unsigned long lastStatus = 0;
    if (millis() - lastStatus > 30000)
    {
        Serial.println("Clients: " + String(WiFi.softAPgetStationNum()) + ", Requests: " + String(requestCount));
        lastStatus = millis();
    }

    delay(10);
}

// Helper function to update activity
void updateActivity()
{
    WebServerManager::updateActivity();
}

// JavaScript code for the web interface
const char *getFileDownloaderJS()
{
    static const char js[] PROGMEM = R"rawliteral(
// =============================================
// FILE DOWNLOADER MODULE - Reusable web components
// =============================================

class FileDownloader {
    constructor() {
        this.currentStorage = 'flash';
        this.storageInfo = null;
        this.downloadedFiles = new Set();
        this.initializeIndexedDB();
        this.init();
    }

    async initializeIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('ESP32FileManager', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                this.loadDownloadedFiles();
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('downloads')) {
                    const store = db.createObjectStore('downloads', { keyPath: 'id' });
                    store.createIndex('filename', 'filename', { unique: false });
                }
            };
        });
    }

    async loadDownloadedFiles() {
        try {
            const transaction = this.db.transaction(['downloads'], 'readonly');
            const store = transaction.objectStore('downloads');
            const request = store.getAll();
            
            request.onsuccess = () => {
                this.downloadedFiles.clear();
                request.result.forEach(item => {
                    this.downloadedFiles.add(item.id);
                });
                this.refreshFileList();
            };
        } catch (error) {
            console.error('Error loading downloaded files:', error);
        }
    }

    async markFileAsDownloaded(fileId, filename, data) {
        try {
            const transaction = this.db.transaction(['downloads'], 'readwrite');
            const store = transaction.objectStore('downloads');
            
            const fileRecord = {
                id: fileId,
                filename: filename,
                downloadedAt: new Date().toISOString(),
                data: data
            };
            
            await store.put(fileRecord);
            this.downloadedFiles.add(fileId);
        } catch (error) {
            console.error('Error marking file as downloaded:', error);
        }
    }

    async init() {
        await this.loadStorageInfo();
        await this.refreshFileList();
        this.updateSystemStats();
        setInterval(() => this.updateSystemStats(), 5000);
    }

    async loadStorageInfo() {
        try {
            const response = await fetch('/api/storage');
            this.storageInfo = await response.json();
            
            const sdBtn = document.getElementById('sdBtn');
            if (this.storageInfo.sd.available) {
                sdBtn.disabled = false;
                sdBtn.textContent = `SD Card (${this.formatBytes(this.storageInfo.sd.free)} free)`;
            } else {
                sdBtn.disabled = true;
                sdBtn.textContent = 'SD Card (Not Available)';
            }
            
            document.getElementById('flashBtn').textContent = 
                `Flash Storage (${this.formatBytes(this.storageInfo.flash.free)} free)`;
                
        } catch (error) {
            this.showStatus('Error loading storage info', 'error');
        }
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

    async refreshFileList() {
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = '<div class="loading">Loading files...</div>';
        
        try {
            const response = await fetch(`/api/files?location=${this.currentStorage}`);
            const data = await response.json();
            
            if (!data.success) {
                fileList.innerHTML = '<div class="error">Failed to load files</div>';
                return;
            }
            
            if (data.files.length === 0) {
                fileList.innerHTML = '<div class="status">No files found in ' + this.currentStorage + ' storage</div>';
                return;
            }
            
            let html = '<h3>Files in ' + this.currentStorage.toUpperCase() + ' Storage:</h3>';
            
            data.files.forEach(file => {
                const fileId = `${this.currentStorage}:${file.path}`;
                const isDownloaded = this.downloadedFiles.has(fileId);
                
                html += `
                    <div class="file-item ${isDownloaded ? 'downloaded' : ''}">
                        <div class="file-info">
                            <div class="file-name">${file.name}</div>
                            <div class="file-size">${this.formatBytes(file.size)}</div>
                        </div>
                        <button class="download-btn" 
                                onclick="fileDownloader.downloadFile('${file.path}', '${file.name}')"
                                ${isDownloaded ? 'disabled' : ''}>
                            ${isDownloaded ? 'Downloaded' : 'Download'}
                        </button>
                    </div>
                `;
            });
            
            fileList.innerHTML = html;
            
        } catch (error) {
            fileList.innerHTML = '<div class="error">Error loading files: ' + error.message + '</div>';
        }
    }

    async downloadFile(filePath, filename) {
        try {
            this.showStatus('Downloading ' + filename + '...', 'success');
            
            const response = await fetch(`/api/download?location=${this.currentStorage}&file=${encodeURIComponent(filePath)}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const blob = await response.blob();
            const data = await blob.arrayBuffer();
            
            // Save to IndexedDB
            const fileId = `${this.currentStorage}:${filePath}`;
            await this.markFileAsDownloaded(fileId, filename, data);
            
            // Create download link
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            this.showStatus(`Successfully downloaded ${filename}`, 'success');
            this.refreshFileList();
            
        } catch (error) {
            this.showStatus(`Error downloading ${filename}: ${error.message}`, 'error');
        }
    }

    async updateSystemStats() {
        try {
            const response = await fetch('/api/stats');
            const stats = await response.json();
            
            const uptime = this.formatUptime(stats.uptime);
            const statsText = `Uptime: ${uptime} | Clients: ${stats.connected_clients} | Requests: ${stats.request_count} | Free Memory: ${this.formatBytes(stats.free_heap)}`;
            
            document.getElementById('systemStats').textContent = statsText;
        } catch (error) {
            document.getElementById('systemStats').textContent = 'Status unavailable';
        }
    }

    showStatus(message, type = 'success') {
        const statusDiv = document.getElementById('statusMessage');
        statusDiv.innerHTML = `<div class="status ${type}">${message}</div>`;
        setTimeout(() => {
            statusDiv.innerHTML = '';
        }, 3000);
    }

    formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return Math.round(bytes / 1024) + ' KB';
        return Math.round(bytes / 1048576) + ' MB';
    }

    formatUptime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours}h ${minutes}m ${secs}s`;
    }
}

// Global instance and functions
let fileDownloader;

window.addEventListener('DOMContentLoaded', () => {
    fileDownloader = new FileDownloader();
});
 
function selectStorage(storage) {
    fileDownloader.selectStorage(storage);
}
)rawliteral";
    return js;
}