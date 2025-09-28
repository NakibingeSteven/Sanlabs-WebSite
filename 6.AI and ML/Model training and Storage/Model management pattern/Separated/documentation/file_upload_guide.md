# ESP32 File Server - Upload Guide

## 📁 Required File Structure in LittleFS

```
/ (LittleFS root)
├── webapp/                    <- Web application files (NOT downloadable)
│   ├── index.html            <- Main interface (from artifact 2)
│   ├── style.css             <- Styles (from artifact 3)  
│   └── app.js                <- JavaScript (from artifact 4)
│
├── data/                     <- Downloadable files only
│   ├── documents/
│   │   ├── manual.pdf
│   │   ├── guide.txt
│   │   └── readme.md
│   ├── images/
│   │   ├── diagram.png
│   │   ├── photo.jpg
│   │   └── logo.svg
│   ├── configs/
│   │   ├── settings.json
│   │   ├── wifi-config.txt
│   │   └── calibration.dat
│   └── simulations/
│       ├── model1.sim
│       ├── experiment.csv
│       └── results.data
│
└── system/                   <- System files (NOT downloadable)
    ├── config.json
    └── logs/
        └── activity.log
```

## 🔧 How to Upload Files

### Method 1: Arduino IDE Data Upload
1. Create `data/` folder in your Arduino project
2. Create the folder structure above
3. Place your files in appropriate folders
4. Tools → ESP32 Sketch Data Upload

### Method 2: Platform.IO Data Upload
1. Create `data/` folder in your project root
2. Create folder structure and add files
3. Run: `pio run --target uploadfs`

### Method 3: Manual Upload (via web interface)
Upload functionality can be added to the web interface if needed.

## 📋 Step by Step Setup

1. **Flash the ESP32 Code** (artifact 1)
   ```cpp
   // Upload the main ESP32 code to the device
   ```

2. **Upload Web App Files** to `/webapp/` folder:
   - `index.html` (artifact 2)
   - `style.css` (artifact 3) 
   - `app.js` (artifact 4)

3. **Add Your Data Files** to `/data/` subfolders:
   - Documents → `/data/documents/`
   - Images → `/data/images/`
   - Config files → `/data/configs/`
   - Simulation files → `/data/simulations/`

4. **Access the Interface**:
   - Connect to WiFi: `FileServer-ESP32`
   - Password: `fileserver2024`
   - Open browser to the IP shown in Serial Monitor

## 🔍 What Each Component Does

### ESP32 Code (artifact 1)
- Creates folder structure automatically
- Serves web app from `/webapp/`
- Only allows downloads from `/data/`
- Provides REST API for file operations
- Security: Prevents access to system files

### HTML (artifact 2) 
- Main user interface
- Storage selection (Flash/SD)
- File listing with categories
- Download progress tracking
- Offline mode support

### CSS (artifact 3)
- Modern, responsive design
- Category-based styling
- Loading animations
- Mobile-friendly layout
- Dark mode support

### JavaScript (artifact 4)
- IndexedDB file caching
- Download management
- Offline functionality
- Category filtering
- Real-time stats

## ⚡ Key Features

✅ **Secure**: Only `/data/` files are downloadable  
✅ **Fast**: Files cached in browser IndexedDB  
✅ **Offline**: Works without ESP32 connection  
✅ **Organized**: Category-based file organization  
✅ **Mobile**: Responsive design for all devices  
✅ **Modular**: Easy to reuse in other projects  

## 🚀 Quick Test

1. Upload just the web app files first
2. Add a test file like `/data/documents/test.txt`
3. Access the web interface
4. Try downloading the test file
5. Check that it's marked as downloaded

## 🔄 Reusable Pattern

This pattern can be reused for:
- Educational content delivery
- IoT device file sharing  
- Local file repositories
- Offline-first applications
- Mobile app resource distribution

Each component is modular and can be adapted independently!
