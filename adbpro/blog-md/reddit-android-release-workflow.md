# What is still too manual in your Android release workflow?

Android releases often look automated from a distance: CI builds the AAB, signs it, and uploads it.

In practice, a surprising number of release-critical checks still depend on somebody remembering them at the right moment.

The recurring pain points I see are:

- Turning the exact release AAB into device-specific APKs and testing it before upload.
- Verifying that the artifact is signed with the intended release certificate, not a debug or staging key.
- Testing the minified artifact, since R8/reflection issues often do not appear in debug.
- Confirming that `debuggable`, environment configuration, feature flags, and ad settings are correct for production.
- Maintaining release-specific rules and configuration as dependencies change.
- Recreating CI setup for each project, including the correct Gradle, JDK, signing, flavor, and artifact settings.
- Managing multi-store or multi-flavor release variants without turning the Gradle file into a fragile pile of exceptions.

My current conclusion is that a release checklist should not live only in someone's head or in a document. The highest-value checks should run against the actual signed release artifact and produce evidence that can be reviewed.

A workflow I find useful is:

1. Build the release AAB.
2. Verify its signing identity and release configuration.
3. Generate and install the device-specific APK set.
4. Exercise the critical flows on the minified build.
5. Archive the artifact hash, signing information, and check results with the release record.

What is the one release step your team still handles manually because automation has been unreliable, difficult to maintain, or simply never prioritized?

I'm especially interested in the checks that pass in CI but still fail after a real upload or production install.

---

**Disclosure:** I build ADB Pro, an Android Studio plugin for AAB, signing, release-readiness, R8, and related workflows. This post is intended to collect practical release-process gaps, not to replace your existing tooling.
