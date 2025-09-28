/ Updated ESP32 Code with File Structure Support
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
const char* ap_ssid = "FileServer-ESP32";
const char* ap_password = "fileserver2024";

// File structure paths
const char* WEBAPP_PATH = "/webapp";
const char* DATA_PATH = "/data";
const char* SYSTEM_PATH = "/system";

// Create AsyncWebServer object
AsyncWebServer server(80);

// System variables
bool sdCardAvailable = false;
int connectedClients = 0;
unsigned long startTime;
unsigned long requestCount = 0;

// =============================================
// STORAGE MODULE - Updated with folder structure
// =============================================

class StorageManager {
public:
  static bool initializeStorage() {
    bool flashOk = LittleFS.begin();
    bool sdOk = SD.begin(SD_CS_PIN);
    
    if (flashOk) {
      Serial.println("✓ Flash storage initialized");
      createFolderStructure();
    } else {
      Serial.println("✗ Flash storage failed");
    }
    
    if (sdOk) {
      Serial.println("✓ SD Card initialized");
      sdCardAvailable = true;
      createSDFolderStructure();
    } else {
      Serial.println("⚠ SD Card not available");
      sdCardAvailable = false;
    }
    
    return flashOk;
  }
  
  static void createFolderStructure() {
    // Create webapp folder structure
    if (!LittleFS.exists(WEBAPP_PATH)) LittleFS.mkdir(WEBAPP_PATH);
    
    // Create data folder structure
    if (!LittleFS.exists(DATA_PATH)) LittleFS.mkdir(DATA_PATH);
    if (!LittleFS.exists("/data/documents")) LittleFS.mkdir("/data/documents");
    if (!LittleFS.exists("/data/images")) LittleFS.mkdir("/data/images");
    if (!LittleFS.exists("/data/configs")) LittleFS.mkdir("/data/configs");
    if (!LittleFS.exists("/data/simulations")) LittleFS.mkdir("/data/simulations");
    
    // Create system folder structure
    if (!LittleFS.exists(SYSTEM_PATH)) LittleFS.mkdir(SYSTEM_PATH);
    if (!LittleFS.exists("/system/logs")) LittleFS.mkdir("/system/logs");
    
    Serial.println("✓ Flash folder structure created");
  }
  
  static void createSDFolderStructure() {
    // Create data folder structure on SD card
    if (!SD.exists(DATA_PATH)) SD.mkdir(DATA_PATH);
    if (!SD.exists("/data/documents")) SD.mkdir("/data/documents");
    if (!SD.exists("/data/images")) SD.mkdir("/data/images");
    if (!SD.exists("/data/configs")) SD.mkdir("/data/configs");
    if (!SD.exists("/data/simulations")) SD.mkdir("/data/simulations");
    
    Serial.println("✓ SD Card folder structure created");
  }
  
  static String getStorageInfo() {
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
    if (sdCardAvailable) {
      sd["total"] = SD.totalBytes();
      sd["used"] = SD.usedBytes();
      sd["free"] = SD.totalBytes() - SD.usedBytes();
    }
    
    String output;
    serializeJson(doc, output);
    return output;
  }
  
  // Only list files in /data folder (downloadable files)
  static String listDataFiles(String location, String path = "/data") {
    DynamicJsonDocument doc(4096);
    JsonArray files = doc.createNestedArray("files");
    JsonArray folders = doc.createNestedArray("folders");
    doc["location"] = location;
    doc["path"] = path;
    doc["success"] = false;
    
    if (location == "flash") {
      File root = LittleFS.open(path);
      if (root && root.isDirectory()) {
        doc["success"] = true;
        scanDirectory(root, files, folders, path);
      }
    }
    else if (location == "sd" && sdCardAvailable) {
      File root = SD.open(path);
      if (root && root.isDirectory()) {
        doc["success"] = true;
        scanDirectory(root, files, folders, path);
      }
    }
    
    String output;
    serializeJson(doc, output);
    return output;
  }
  
private:
  static void scanDirectory(File& dir, JsonArray& files, JsonArray& folders, String basePath) {
    File file = dir.openNextFile();
    while (file) {
      String fullPath = String(file.name());
      String relativePath = fullPath;
      
      // Remove base path to get relative path
      if (fullPath.startsWith(basePath)) {
        relativePath = fullPath.substring(basePath.length());
        if (relativePath.startsWith("/")) relativePath = relativePath.substring(1);
      }
      
      if (file.isDirectory()) {
        JsonObject folderObj = folders.createNestedObject();
        folderObj["name"] = relativePath;
        folderObj["path"] = fullPath;
      } else {
        JsonObject fileObj = files.createNestedObject();
        fileObj["name"] = relativePath;
        fileObj["size"] = file.size();
        fileObj["path"] = fullPath;
        
        // Add category based on folder
        String category = "general";
        if (fullPath.indexOf("/documents/") >= 0) category = "documents";
        else if (fullPath.indexOf("/images/") >= 0) category = "images";
        else if (fullPath.indexOf("/configs/") >= 0) category = "configs";
        else if (fullPath.indexOf("/simulations/") >= 0) category = "simulations";
        fileObj["category"] = category;
      }
      file = dir.openNextFile();
    }
  }

public:
  static bool fileExists(String location, String path) {
    if (location == "flash") {
      return LittleFS.exists(path);
    } else if (location == "sd" && sdCardAvailable) {
      return SD.exists(path);
    }
    return false;
  }
  
  static File openFile(String location, String path) {
    if (location == "flash") {
      return LittleFS.open(path, "r");
    } else if (location == "sd" && sdCardAvailable) {
      return SD.open(path, FILE_READ);
    }
    return File();
  }
  
  // Check if file is in downloadable data folder
  static bool isDownloadableFile(String path) {
    return path.startsWith("/data/");
  }
  
  // Check if file is a webapp file
  static bool isWebappFile(String path) {
    return path.startsWith("/webapp/");
  }
};

// =============================================
// WEB SERVER MODULE - Updated for file structure
// =============================================

class WebServerManager {
public:
  static void setupRoutes() {
    // Serve main page from LittleFS
    server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
      updateActivity();
      if (LittleFS.exists("/webapp/index.html")) {
        request->send(LittleFS, "/webapp/index.html", "text/html");
      } else {
        request->send_P(200, "text/html", getFallbackHTML());
      }
    });
    
    // Serve CSS from LittleFS
    server.on("/style.css", HTTP_GET, [](AsyncWebServerRequest *request) {
      updateActivity();
      if (LittleFS.exists("/webapp/style.css")) {
        request->send(LittleFS, "/webapp/style.css", "text/css");
      } else {
        request->send(404, "text/plain", "CSS not found");
      }
    });
    
    // Serve JavaScript from LittleFS
    server.on("/app.js", HTTP_GET, [](AsyncWebServerRequest *request) {
      updateActivity();
      if (LittleFS.exists("/webapp/app.js")) {
        request->send(LittleFS, "/webapp/app.js", "application/javascript");
      } else {
        request->send(404, "text/plain", "JavaScript not found");
      }
    });
    
    // API: Get storage information
    server.on("/api/storage", HTTP_GET, [](AsyncWebServerRequest *request) {
      updateActivity();
      String json = StorageManager::getStorageInfo();
      request->send(200, "application/json", json);
    });
    
    // API: List ONLY data files (downloadable)
    server.on("/api/files", HTTP_GET, [](AsyncWebServerRequest *request) {
      updateActivity();
      String location = "flash"; // default
      if (request->hasParam("location")) {
        location = request->getParam("location")->value();
      }
      String path = "/data"; // Only scan data folder
      if (request->hasParam("path")) {
        String requestPath = request->getParam("path")->value();
        // Ensure path starts with /data
        if (requestPath.startsWith("/data")) {
          path = requestPath;
        }
      }
      String json = StorageManager::listDataFiles(location, path);
      request->send(200, "application/json", json);
    });
    
    // API: Download file (only from data folder)
    server.on("/api/download", HTTP_GET, [](AsyncWebServerRequest *request) {
      updateActivity();
      if (!request->hasParam("location") || !request->hasParam("file")) {
        request->send(400, "application/json", "{\"error\":\"Missing parameters\"}");
        return;
      }
      
      String location = request->getParam("location")->value();
      String filePath = request->getParam("file")->value();
      
      // Security check: only allow downloads from /data folder
      if (!StorageManager::isDownloadableFile(filePath)) {
        request->send(403, "application/json", "{\"error\":\"File not downloadable\"}");
        return;
      }
      
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
      file.close();
    });
    
    // API: System stats
    server.on("/api/stats", HTTP_GET, [](AsyncWebServerRequest *request) {
      updateActivity();
      String json = getSystemStats();
      request->send(200, "application/json", json);
    });
    
    // Generic file handler for webapp files only
    server.onNotFound([](AsyncWebServerRequest *request) {
      updateActivity();
      String path = request->url();
      
      // Only serve files from webapp folder
      String webappPath = "/webapp" + path;
      if (LittleFS.exists(webappPath)) {
        request->send(LittleFS, webappPath, getContentType(path));
        return;
      }
      
      request->send(404, "text/plain", "Not found");
    });
  }
  
  static void updateActivity() {
    requestCount++;
  }
  
private:
  static String getContentType(String filename) {
    if (filename.endsWith(".html")) return "text/html";
    else if (filename.endsWith(".css")) return "text/css";
    else if (filename.endsWith(".js")) return "application/javascript";
    else if (filename.endsWith(".json")) return "application/json";
    else if (filename.endsWith(".png")) return "image/png";
    else if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) return "image/jpeg";
    else if (filename.endsWith(".txt")) return "text/plain";
    else if (filename.endsWith(".pdf")) return "application/pdf";
    return "application/octet-stream";
  }
  
  static String getSystemStats() {
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
  
  // Fallback HTML if webapp files are not found
  static const char* getFallbackHTML() {
    return R"rawliteral(
<!DOCTYPE html>
<html>
<head>
    <title>ESP32 File Server</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; }
        h1 { color: #d32f2f; }
        .error { background: #ffebee; padding: 15px; border-radius: 4px; color: #c62828; }
    </style>
</head>
<body>
    <div class="container">
        <h1>⚠️ Web App Files Missing</h1>
        <div class="error">
            <p><strong>The web application files are not found in LittleFS.</strong></p>
            <p>Please upload the following files to the <code>/webapp/</code> folder:</p>
            <ul>
                <li><code>/webapp/index.html</code></li>
                <li><code>/webapp/style.css</code></li>
                <li><code>/webapp/app.js</code></li>
            </ul>
            <p>Server is running, but the full interface requires these files.</p>
        </div>
    </div>
</body>
</html>
)rawliteral";
  }
};

// =============================================
// MAIN SETUP AND LOOP
// =============================================

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  
  Serial.println("\n=== ESP32 File Server Starting ===");
  Serial.println("File Structure:");
  Serial.println("├── /webapp/     <- Web app files");
  Serial.println("├── /data/       <- Downloadable files");
  Serial.println("└── /system/     <- System files");
  
  // Initialize storage with folder structure
  if (!StorageManager::initializeStorage()) {
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
  
  // Start server
  server.begin();
  Serial.println("✓ Server started");
  Serial.println("\nTo upload web files, use Arduino IDE Data Upload or:");
  Serial.println("- Place index.html in /webapp/");
  Serial.println("- Place style.css in /webapp/");
  Serial.println("- Place app.js in /webapp/");
  Serial.println("- Place data files in /data/ subfolders");
  
  // Ready indicator
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(200);
    digitalWrite(LED_PIN, LOW);
    delay(200);
  }
}

void loop() {
  // Heartbeat LED
  static unsigned long lastBlink = 0;
  if (millis() - lastBlink > 1000) {
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    lastBlink = millis();
  }
  
  // Print status every 30 seconds
  static unsigned long lastStatus = 0;
  if (millis() - lastStatus > 30000) {
    Serial.println("Status - Clients: " + String(WiFi.softAPgetStationNum()) + 
                  ", Requests: " + String(requestCount) + 
                  ", Free Heap: " + String(ESP.getFreeHeap()));
    lastStatus = millis();
  }
  
  delay(10);
}

// Helper function to update activity
void updateActivity() {
  WebServerManager::updateActivity();
}