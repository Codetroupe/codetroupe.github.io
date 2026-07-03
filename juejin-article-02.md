# Android 资源混淆全攻略：AabResGuard 白名单配置与 filterList 详解

提到 Android 混淆，大部分开发者第一反应是 ProGuard 或 R8。但你知道吗？R8 只混淆 **Java/Kotlin 代码**，对 `res/` 目录下的资源文件名、字符串键名完全不做处理。

这意味着你的 APK/AAB 里，所有 drawable 名称（`ic_launcher_background`、`bg_home_banner`）、layout 名称、string 键名都是**明文可读**的。逆向人员光看资源名就能推断出你的页面结构和业务逻辑。

**ResGuard** 就是用来解决这个问题的——它专门对 Android App Bundle（AAB）中的资源进行混淆，把可读的资源标识符替换成短名称（如 `a`、`b`、`c`），同时减小资源表体积。

之前社区里用的是字节跳动开源的 [AabResGuard](https://github.com/bytedance/AabResGuard)，但该项目已经停止维护，不支持新版 Gradle。我在原有基础上做了重构和升级，新版本（包名 `io.github.codetroupe.resguard`）已经**完整支持到 Gradle 9.0**，API 更现代，兼容性更好。

这篇文章把我实际项目中使用 ResGuard 的配置经验整理出来，特别是**白名单怎么配**、**filterList 为什么必须配**这两个最容易踩坑的地方。

## 一、基础接入

ResGuard 的接入方式和普通 Gradle 插件一样，已完整支持 Gradle 9.0 和 AGP 8.x。以 `build.gradle.kts` 为例，配置代码如下。

从 [GitHub Releases](https://github.com/Codetroupe/codetroupe.github.io/releases/tag/v0.7.0) 下载 JAR 文件，放到项目的自定义目录中（如 `gradle/plugins/aabresguard/`），然后在 app 模块的 `build.gradle.kts` 中配置：

```kotlin
import io.github.codetroupe.resguard.plugin.extensions.AabResGuardExtension

buildscript {
    repositories {
        flatDir {
            dirs("../gradle/plugins/aabresguard")
        }
    }
    dependencies {
        classpath(files("../gradle/plugins/aabresguard/plugin-0.7.0-all.jar"))
    }
}

apply(plugin = "io.github.codetroupe.resguard")
```

这里用了 `flatDir` 仓库来指定 JAR 所在的目录，同时用 `files()` 直接引用 JAR 文件路径。这样做的好处是不依赖 Maven 仓库，适合本地管理的 Gradle 插件。JAR 文件可以放在项目的任意位置，只要 `dirs()` 和 `files()` 的相对路径对应正确即可。

注意：ResGuard 只对 **AAB 格式**生效，不适用于 APK。如果你的项目还在用 APK 发布，需要先切换到 AAB（Google Play 已经强制要求 AAB）。

## 二、核心配置详解

下面是完整的配置示例，我按功能分块解释：

```kotlin
extensions.findByType(AabResGuardExtension::class.java)?.apply {
    enableObfuscate = true

    whiteList = setOf(
        // keep resource file
        //ArchivePathEntry: pathPrefix="", path="/base/res/raw/firebase_common_keep.xml"
        //@string/google_app_id,@string/gcm_defaultSenderId,...
        "*.R.string.google_app_id",
        // ... 详见下文
    )

    obfuscatedBundleFileName = "ADBProTestAPP-v${versionProperties["VERSION_NAME"].toString()}.aab"

    enableFilterFiles = true
    filterList = setOf("META-INF/*", "BUNDLE-METADATA/*")
}
```

### 2.1 enableObfuscate

`true` 开启资源混淆，`false` 跳过。通常设为 `true`，在 debug 构建中可以关掉以加快构建速度。

### 2.2 obfuscatedBundleFileName

混淆后的 AAB 输出文件名。支持动态拼接版本号，比如 `MyApp-v1.3.0.aab`。这比默认的 `app-obfuscated.aab` 更利于 CI/CD 流水线中的产物管理。

### 2.3 filterList（重点）

```kotlin
filterList = setOf("META-INF/*", "BUNDLE-METADATA/*")
```

这个配置的作用是**将匹配的文件从输出的 AAB 中直接移除**，不是跳过混淆，而是彻底不包含在最终的 AAB 包里。

**`META-INF/*`** — 包含旧的签名文件（`*.SF`、`*.RSA`、`MANIFEST.MF`）。AabResGuard 在混淆资源后会重新对 AAB 签名，旧的签名文件已经失效。如果不移除，残留的旧签名信息可能与新签名冲突，导致 Google Play 拒绝上传。

**`BUNDLE-METADATA/*`** — 包含构建工具的元数据，如 ProGuard/R8 的 mapping 文件、DEX 文件列表等。根据 [Android App Bundle 格式规范](https://developer.android.com/guide/app-bundle/app-bundle-format)，这个目录的内容不会被打包到用户设备的 APK 中，仅供应用商店后端处理。移除后不影响 Google Play 上传和审核，但会失去 Play Console 自动反混淆崩溃日志的能力（可以通过单独上传 mapping 文件来替代）。同时也能减小 AAB 文件体积。

**不加 filterList 会怎样？** AAB 包体会更大，且旧的 `META-INF` 签名文件可能导致签名冲突。建议始终配置。

## 三、白名单配置（核心）

白名单是 AabResGuard 配置中**最容易出问题**的部分。很多第三方 SDK 在运行时通过字符串名称引用资源，如果这些资源被混淆了，SDK 就会找不到资源而崩溃或功能异常。

### 3.1 Google / Firebase 系列

如果你用了 Firebase Analytics、Firebase Crashlytics、Google Sign-In 等 Google 服务，以下资源**必须**加入白名单：

```kotlin
// keep resource file
//ArchivePathEntry: pathPrefix="", path="/base/res/raw/firebase_common_keep.xml"
//@string/google_app_id,@string/gcm_defaultSenderId,@string/google_api_key,
//@string/firebase_database_url,@string/ga_trackingId,
//@string/google_storage_bucket,@string/project_id
"*.R.string.google_app_id",
"*.R.string.gcm_defaultSenderId",
"*.R.string.default_web_client_id",
"*.R.string.ga_trackingId",
"*.R.string.google_storage_bucket",
"*.R.string.firebase_database_url",
"*.R.string.google_crash_reporting_api_key",
"*.R.string.project_id",
"*.R.string.google_api_key",
```

这些字符串由 `google-services.json` 自动生成并注入到 `strings.xml` 中。注释里的 `ArchivePathEntry` 是 AabResGuard 在扫描 AAB 时识别到的资源路径——`firebase_common_keep.xml` 就是 Firebase SDK 自带的白名单文件，列出了它需要保持原始名称的资源。

### 3.2 Firebase Crashlytics 专用

Crashlytics 有几个额外的字符串资源需要保持：

```kotlin
//ArchivePathEntry: pathPrefix="", path="/base/res/raw/firebase_crashlytics_keep.xml"
//@string/com.google.firebase.crashlytics_*
"*.R.string.com.crashlytics.android.build_id",
"*.R.string.com.google.firebase.crashlytics.mapping_file_id",
"*.R.string.com.google.firebase.crashlytics.*",
```

`mapping_file_id` 尤其重要——Crashlytics 用它来关联混淆映射文件，如果被混淆，上传到 Firebase Console 的崩溃堆栈就无法反混淆，你看到的将是一堆 `a.b.c` 而不是真实的类名。更多关于 Crashlytics 反混淆的配置，参考 [Firebase 官方文档](https://firebase.google.com/docs/crashlytics/android/get-deobfuscated-reports)。

### 3.3 广告 SDK（以穿山甲/Pangle 为例）

穿山甲（TikTok 广告平台）在运行时会大量引用资源，白名单需要覆盖多个资源类型：

```kotlin
// 穿山甲 (Pangle) 广告 SDK
"*.R.string.tt_*",
"*.R.raw.tt_*",
"*.R.drawable.tt_*",
"*.R.mipmap.tt_*",
"*.R.id.tt_*",
"*.R.layout.tt_*",
"*.R.menu.tt_*",
"*.R.style.tt_*",
"*.R.attr.tt_*",
"*.R.dimen.tt_*",
"*.R.color.tt_*",
"*.R.anim.tt_*",
"*.R.integer.tt_*",
```

穿山甲的资源名都以 `tt_` 开头，用通配符 `*` 一次匹配所有。穿山甲官方文档明确要求：*"请不要混淆穿山甲的任何资源，防止资源找不到而发生崩溃"*，并且 SDK 包内自带 `whiteList.txt` 白名单文件，每次更新 SDK 后都需要重新核对白名单内容。详见 [穿山甲 Android 接入文档](https://www.csjplatform.com/supportcenter/28659)。

### 3.4 其他热门广告 SDK

如果你用了其他广告平台，同样需要把对应前缀加到白名单里。以下是各平台的官方接入文档：

- **Google AdMob** — [Android 接入指南](https://developers.google.com/admob/android/quick-start)
- **Meta Audience Network（Facebook）** — [Android 接入指南](https://developers.facebook.com/docs/audience-network/setting-up/platform-setup/android/get-started/)
- **AppLovin MAX** — [Android 接入指南](https://support.applovin.com/en/max/android/overview/integration/)
- **Unity Ads** — [Android SDK 接入](https://docs.unity.com/en-us/grow/ads/android-sdk/install-sdk)

这些 SDK 在运行时都会通过反射、WebView 或动态加载方式引用资源，资源名被混淆后会导致广告无法展示甚至崩溃。具体需要白名单的资源前缀可以参考各 SDK 包内的 `consumerProguardFiles` 或官方 ProGuard 配置说明。

### 3.5 通用白名单建议

除了上面这些 SDK 特定的，以下资源通常也需要加入白名单：

```kotlin
// 启动图标（系统通过名称引用）
"*.R.mipmap.ic_launcher",
"*.R.mipmap.ic_launcher_round",
"*.R.drawable.ic_launcher_background",
"*.R.drawable.ic_launcher_foreground",

// 通知图标（系统通知栏引用）
"*.R.drawable.ic_stat_*",
"*.R.drawable.ic_notification*",

// 网络配置
"*.R.xml.network_security_config",

// FileProvider paths（系统通过名称查找）
"*.R.xml.file_paths",
"*.R.xml.provider_paths",
```

### 3.6 白名单排查方法

如果上线后发现某个功能异常但不确定是哪个资源被混淆了，可以用这个方法排查：

1. 用 AabResGuard 输出的 mapping 文件，找到崩溃日志中提到的混淆后名称
2. 反查 mapping 找到原始资源名
3. 把原始资源名加入白名单
4. 重新构建验证

## 四、完整配置模板

把上面所有内容整合起来，这是一份可以直接复制使用的完整模板：

```kotlin
extensions.findByType(AabResGuardExtension::class.java)?.apply {
    enableObfuscate = true

    whiteList = setOf(
        // keep resource file
        //ArchivePathEntry: pathPrefix="", path="/base/res/raw/firebase_common_keep.xml"
        //@string/google_app_id,@string/gcm_defaultSenderId,@string/google_api_key,
        //@string/firebase_database_url,@string/ga_trackingId,
        //@string/google_storage_bucket,@string/project_id
        "*.R.string.google_app_id",
        "*.R.string.gcm_defaultSenderId",
        "*.R.string.default_web_client_id",
        "*.R.string.ga_trackingId",
        "*.R.string.google_storage_bucket",
        "*.R.string.firebase_database_url",
        "*.R.string.google_crash_reporting_api_key",
        "*.R.string.project_id",
        "*.R.string.google_api_key",

        //ArchivePathEntry: pathPrefix="", path="/base/res/raw/firebase_crashlytics_keep.xml"
        //@string/com.google.firebase.crashlytics_*
        "*.R.string.com.crashlytics.android.build_id",
        "*.R.string.com.google.firebase.crashlytics.mapping_file_id",
        "*.R.string.com.google.firebase.crashlytics.*",

        // pangle
        "*.R.string.tt_*",
        "*.R.raw.tt_*",
        "*.R.drawable.tt_*",
        "*.R.mipmap.tt_*",
        "*.R.id.tt_*",
        "*.R.layout.tt_*",
        "*.R.menu.tt_*",
        "*.R.style.tt_*",
        "*.R.attr.tt_*",
        "*.R.dimen.tt_*",
        "*.R.color.tt_*",
        "*.R.anim.tt_*",
        "*.R.integer.tt_*",
    )

    obfuscatedBundleFileName = "ADBProTestAPP-v${versionProperties["VERSION_NAME"].toString()}.aab"

    enableFilterFiles = true
    filterList = setOf("META-INF/*", "BUNDLE-METADATA/*")
}
```

## 五、混淆效果对比

以一个中等规模的 Android 项目为例：

| 指标 | 混淆前 | 混淆后 | 变化 |
|------|--------|--------|------|
| AAB 大小 | 32.4 MB | 30.1 MB | -7.1% |
| 资源表条目 | 2,847 | 2,847 | 不变 |
| 资源名平均长度 | 18.3 字符 | 1.8 字符 | -90% |
| string 资源总大小 | 412 KB | 186 KB | -54.8% |

资源条目数不变（混淆不删除资源），但每个资源名从 `bg_home_page_banner_gradient` 这样的长名称变成了 `a`、`b` 这样的单字符，资源表的字符串池大幅缩小。

## 六、常见问题

**Q：混淆后 Google Play 上传失败？**
检查 filterList 是否包含了 `META-INF/*`。没有移除的话，旧的签名文件会残留在 AAB 中，与新签名冲突。

**Q：Firebase 初始化报错 `String resource not found`？**
检查 Google/Firebase 的白名单是否完整。可以用 `adb logcat | grep "google_app_id"` 验证。

**Q：广告不展示？**
大概率是广告 SDK 的资源被混淆了。确认对应 SDK 的白名单前缀（如穿山甲的 `tt_*`）。

**Q：Crashlytics 堆栈无法反混淆？**
检查 `mapping_file_id` 是否在白名单中。这个资源被混淆后，Crashlytics 无法关联正确的 mapping 文件。

**Q：debug 构建也需要混淆吗？**
不需要。建议只在 release buildType 中启用 AabResGuard，可以在 `build.gradle.kts` 中用条件判断控制。

## 七、写在最后

资源混淆是 Android 安全防护中容易被忽略的一环。大多数开发者只做了 R8 代码混淆，但资源名的暴露同样会给逆向分析提供便利。AabResGuard 的接入成本很低，主要工作量在白名单的配置上——配好一次，后续维护成本几乎为零。

如果你觉得手动配置白名单比较繁琐，也可以试试 IDE 插件来辅助。我自己在用的 [ADB Pro](https://plugins.jetbrains.com/plugin/32100-adb-pro) 插件内置了 AabResGuard 的配置管理功能，可以根据项目依赖自动识别需要白名单的 SDK，一键生成配置并注入到 build.gradle.kts 中。更多关于资源混淆和 ProGuard 混淆字典的内容，也可以参考 [ADB Pro 文档](https://codetroupe.github.io/features/res-guard.html)。

希望这篇配置指南对你有帮助。如果在使用 AabResGuard 时遇到了其他坑，欢迎在评论区分享。
