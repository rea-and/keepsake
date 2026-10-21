# Android Client Guide for Keepsake

The Keepsake Android client allows you to browse all your collections and bookmarks on your mobile device and ingest links directly from any Android app using the system Share Sheet.

---

## 1. Features
- **Browse & Search**: Full mobile access to collections, tags, favorites, and search.
- **Link Ingestion From Any App**: Tap "Share" from Chrome, Firefox, YouTube, Reddit, X (Twitter), LinkedIn, Pocket, etc., and select **"Save to Keepsake"**.
- **Offline Caching**: Bookmarks are cached locally on device for offline access.
- **Direct Reader Mode**: Read distraction-free articles without popups or ads.

---

## 2. Building the Android App

You can build the APK using Android Studio or the command line.

### Option A: Using Android Studio (Recommended)
1. Open Android Studio.
2. Select **Open an Existing Project** and choose the `/apps/android` directory.
3. Allow Gradle to sync.
4. Click **Run** or go to **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**.
5. Transfer the generated APK to your Android device and install it.

### Option B: Command Line (Gradle)
```bash
cd apps/android
./gradlew assembleDebug
```
The APK will be generated at:
`apps/android/app/build/outputs/apk/debug/app-debug.apk`

Install directly to a connected Android device or emulator:
```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## 3. Configuring Your Server Address

1. Open the **Keepsake** app on your Android device.
2. If connecting for the first time or if the server cannot be reached, the app will prompt you for your server URL:
   - Example: `https://keepsake.yourdomain.com` or `http://192.168.1.100:3000`
3. Tap **Connect**.
4. Tap **Sign in with Google** to authenticate and sync your bookmarks.

---

## 4. Ingesting Links from Any App

1. In any app (Chrome, Twitter, YouTube, Reddit), tap the **Share** button.
2. In the Android share sheet, choose **Keepsake** (or "Save to Keepsake").
3. Keepsake will automatically extract the link and title and open the bookmark saver.
4. Pick a collection, add tags, and tap **Save**.
