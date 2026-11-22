# PowerResolve Android APK (test distribution)

This is the **Android-first companion** to the PowerResolve Cloudflare Worker web app.
It wraps the same responsive UI in a secure Android WebView, with:

- An initial secure HTTPS service-address screen (no Cloudflare URL is yet provisioned)
- Android 10+ support, large touch controls and bottom navigation in the hosted UI
- Runtime GPS permissions and device-location integration
- Photo selection and supported camera capture for evidence uploads
- Back navigation, external-link handling and secure HTTPS-only content
- No preinstalled usernames, passwords, tokens or real user records

**This APK needs a live Cloudflare Worker URL to function.** The existing Cloudflare
`wrangler.jsonc` still has an unresolved database ID; the app cannot use an undeployed backend.
Enter the deployed URL under **Connect securely** on the first launch. The base URL can
later be changed using **Server** in the app header.

## Build on GitHub (recommended)

The workflow `Build Android APK` runs whenever this folder changes on the `main` branch,
and can also be started under **Actions -> Build Android APK -> Run workflow**.
After it passes, open the run and download the `PowerResolve-Android-APK` artifact.
Unzip it to obtain `PowerResolve-Android-debug.apk` and its SHA-256 checksum.

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
Photos remain subject to the host service's server-side limits (PNG/JPEG/WEBP, 2 MB).

## Limits

- Network connection and a functional Cloudflare Worker are required.
- This build is an Android WebView application; it is **not** a native Flutter build.
- Notifications currently appear in the app timeline, not as native Android push notifications.
- These software-only test cases do not establish real repair performance or utility integration.
