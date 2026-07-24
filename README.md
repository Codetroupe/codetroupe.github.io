# ADB Pro — Official Website

[![Website](https://img.shields.io/website?url=https%3A%2F%2Fcodetroupe.github.io)](https://codetroupe.github.io/)
[![JetBrains Plugin](https://img.shields.io/jetbrains/plugin/v/32100?label=ADB%20Pro)](https://plugins.jetbrains.com/plugin/32100-adb-pro)
[![License](https://img.shields.io/badge/license-proprietary-blue)](https://codetroupe.github.io/subscription-agreement.html)

The official marketing and documentation site for [ADB Pro](https://plugins.jetbrains.com/plugin/32100-adb-pro) — an all-in-one Android build, sign & release toolkit for Android Studio and IntelliJ IDEA.

## Live Site

**https://codetroupe.github.io/**

## What is ADB Pro?

ADB Pro is a paid JetBrains Marketplace plugin that consolidates 13 Android development modules into a single tool window:

| Module | Description |
|---|---|
| **Quick Setup** | One-click project wizard with channels, SDKs, signing, R8 rules, and CI/CD generation |
| **AAB Tools** | Convert, sign, and install Android App Bundles to one target or selected devices; auto-manages Bundletool |
| **R8 Assistant** | ProGuard/R8 rule recommendation with 20+ library templates, reflection scanning |
| **Resource Obfuscation** | AabResGuard integration with whitelists, Gradle plugin JAR management, and obfuscation dictionaries |
| **Signing Tools** | APK signing (v1/v2/v3), zipalign, keystore management |
| **Build Tools** | Gradle automation, variant management, batch builds |
| **Bundle Inspector** | Deep AAB/APK size analysis with trend charts |
| **Release Readiness** | Automated pre-release checklist with signing, minification, SDK, security, and compatibility checks |
| **Lint Tools** | Android Lint with parsed issue visualization |
| **Dependency Health** | Conflict detection, deprecation warnings, version catalog management |
| **CI/CD Tools** | Pipeline config generation for GitHub Actions, GitLab CI, Gitee Go |
| **Build Performance** | Build profiling and Gradle health checks |
| **Device Manager** | ADB auto-discovery and connection monitoring |

## Site Structure

```
index.html                  # Landing page with hero, feature grid, and CTA
getting-started.html        # Installation and first-use guide
pricing.html                # Pricing plans and free trial info
feedback.html               # User feedback form (supports URL params for pre-filling)
privacy-policy.html         # Website privacy policy
plugin-privacy-policy.html  # Plugin privacy policy (for JetBrains Marketplace)
subscription-agreement.html # Subscription terms

features/                   # Individual feature pages (13 modules)
  index.html                # Feature overview
  quick-setup.html
  aab-tools.html
  ...

dictionaries/               # Free ProGuard obfuscation dictionaries
  index.html                # Dictionary overview and download
  proguard-dic-*.txt        # 11 dictionary files

assets/                     # Static assets
  css/style.css
  js/main.js
  logo.png
  favicon.ico
```

## Tech Stack

- Astro static site generation
- Shared layout, SEO, navigation, and footer components
- Editable page bodies stored in `site/src/content-pages/`
- Custom CSS with dark/light theme support
- Google Fonts: Inter + JetBrains Mono
- Feather-style inline SVG icons
- Deployed via GitHub Pages

## Deployment

The source site lives in `site/`. Build it with:

```bash
cd site
npm install
npm run build
```

The build writes the generated static output to `web/`. The `deploy-web.yml` workflow builds `site/` first, then deploys the generated `web/` directory.

For long-term changes, edit `site/src` or `site/public` and rebuild. The `web/` directory is generated output.

## Links

- [JetBrains Marketplace](https://plugins.jetbrains.com/plugin/32100-adb-pro)
- [Free ProGuard Dictionaries](https://codetroupe.github.io/dictionaries/)

## License

The website content is proprietary. The ProGuard dictionaries in `dictionaries/` are freely available for use.

---

&copy; 2026 codetroupe
