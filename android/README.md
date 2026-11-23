# PowerResolve Android APK (test distribution)

This is the **Android-first companion** to the PowerResolve Cloudflare Worker web app.
It wraps the same responsive UI in a secure Android WebView, with:

- Automatic HTTPS service connection when `POWERRESOLVE_SERVICE_URL` is embedded at build time; a manual setup screen for developer testing otherwise
- Android 10+ support, large touch controls and bottom navigation in the hosted UI
- Runtime GPS permissions and device-location integration
- Back navigation, external-link handling and secure HTTPS-only content
- No preinstalled usernames, passwords, tokens or real user records

**Default service URL for version 1.0.4:** [https://powe-complaint-system.powerresolve.workers.dev/](https://powe-complaint-system.powerresolve.workers.dev/)

The Android application opens this HTTPS address directly after installation. No manual server URL is required for the published APK. The GitHub Actions workflow checks `/api/health` on this exact new hostname before compiling and publishing an APK. If the endpoint is unavailable, the build stops instead of publishing an APK with a broken connection.

The Cloudflare account's previous `workers.dev` subdomain has been replaced. Android versions built against the previous hostname are obsolete and should be replaced with **v1.0.4-powerresolve**. A custom local build can override the Gradle default through `POWERRESOLVE_SERVICE_URL`, but the official GitHub Actions workflow deliberately targets the new hostname to avoid stale repository variables.

## Build on GitHub (recommended)

The workflow `Build Android APK` runs whenever this folder changes on the `main` branch,
and can also be started under **Actions -> Build Android APK -> Run workflow**.
After it passes, the workflow publishes `PowerResolve-Android-v1.0.4-powerresolve.apk` and its SHA-256 checksum in the GitHub release `android-v1.0.4-powerresolve`. The workflow also keeps the `PowerResolve-Android-APK` Actions artifact.

Install the debug APK **only on a test device** after reviewing the source and recognizing
that it is an unreleased demonstration. The debug build has an auto-generated
**debug signing key** and is **not** a Play Store or production release. For public distribution,
create your own private release signing key, configure a signed release build, complete
Android security/quality tests and obtain relevant utility authorizations.

## Manual build in Android Studio

Open the `android/` subdirectory as a Gradle project. Use JDK 17, Android SDK 35, Android
Gradle plugin 8.7.3 and Gradle 8.9. Run `:app:assembleDebug`.

## Mobile privacy

The Android app requests location permission only when a user chooses **Use device location**;
no background location or unrestricted file access is requested. It does not install a
JavaScript interface, refuses HTTP, and restricts in-app navigation to the configured host.
Photo attachment, camera and gallery access have been removed. Complaints use descriptions, categories, addresses, and optional GPS coordinates only.

## Limits

- Network connection and a functional Cloudflare Worker are required.
- This build is an Android WebView application; it is **not** a native Flutter build.
- Notifications currently appear in the app timeline, not as native Android push notifications.
- These software-only test cases do not establish real repair performance or utility integration.
