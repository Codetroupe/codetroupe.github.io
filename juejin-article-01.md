# Android 发版踩坑实录：从手动打包到全流程自动化

作为一个做了多年 Android 的开发者，每次发版都像一场小型战役。Bundletool 版本不对、签名配置丢失、ProGuard 规则漏写、发布前忘了关 debug 开关……这些问题反复出现，每次都要花时间排查。

这篇文章把我在实际项目中遇到的发版痛点，以及逐步搭建自动化流程的思路分享出来。如果你也在为 Android 发版流程头疼，希望能给你一些参考。

## 痛点一：Bundletool 管理是个无底洞

Google Play 强制要求 AAB 格式后，`bundletool` 成了必备工具。但它的使用体验是这样的：

```bash
# 1. 手动下载 bundletool jar（版本号经常更新）
# 2. 把 AAB 转成 APKS
java -jar bundletool-all-1.17.2.jar build-apks \
  --bundle=app-release.aab \
  --output=app-release.apks \
  --ks=release-key.jks \
  --ks-key-alias=myalias \
  --ks-pass=pass:xxxxx

# 3. 安装到设备
java -jar bundletool-all-1.17.2.jar install-apks \
  --apks=app-release.apks \
  --device-id=XXXXXX
```

三条命令，每次都手敲。版本号变了要重新下载 jar，密钥密码要明文写在命令行（安全问题），多设备时还要指定 device-id。

### 我的解决思路

把 Bundletool 的版本管理和下载自动化：检测到本地没有 bundletool 或版本过低时，自动从 GitHub Releases 下载最新版。把密钥信息从项目配置中读取，而不是命令行参数。

核心逻辑其实不复杂，就是一个带自动更新的下载器 + 命令封装：

```kotlin
// 检测本地 bundletool 版本，低于最新版则自动下载
fun ensureBundletool(): File {
    val local = getLocalBundletool()
    val latest = fetchLatestVersion() // 从 GitHub API 获取
    if (local == null || compareVersions(local.version, latest) < 0) {
        downloadBundletool(latest)
    }
    return getLocalBundletool()!!.jar
}
```

把这个封装好后，"选 AAB → 选设备 → 一键安装"就变成了一个 UI 操作，不需要再碰命令行。

## 痛点二：ProGuard/R8 规则永远写不全

每次引入新依赖库，都要去查它的官方文档看需要什么 keep 规则。Gson 要 `@SerializedName`，Retrofit 要 `@Serializable`，Room 要 Entity 和 Dao……漏写一条，Release 包就 crash。

### 一个实用的方法论

与其每次手动查，不如建立一个**规则模板库**。我整理了 20 多个常用库的推荐规则：

```proguard
# Retrofit + OkHttp
-dontwarn okhttp3.**
-dontwarn retrofit2.**
-keep class retrofit2.** { *; }
-keepattributes Signature
-keepattributes Exceptions

# Gson
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.google.gson.** { *; }
-keep class * implements com.google.gson.TypeAdapterFactory
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer

# Room
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class *
-dontwarn androidx.room.paging.**
```

更进一步，可以扫描项目的 `build.gradle` 依赖列表，自动匹配已有模板并生成规则文件。这个思路的好处是：引入新库时，只要模板库里有对应规则，就不会遗漏。

## 痛点三：发版前检查全靠人脑记忆

你有没有经历过这些事：

- 发版后才发现 `debuggable true` 没关
- API Key 硬编码在代码里，Release 包一拆就看到
- `minifyEnabled` 没开，包体积大了一倍
- 签名用的还是 debug keystore

每次发版前，脑子里过一遍清单。但人总会忘记，特别是赶工期的时候。

### 解决方案：13 项自动化检查

我把常见的发版遗漏整理成了一个检查清单，用代码自动扫描：

| 检查项 | 检测方式 |
|---|---|
| `debuggable` 是否为 false | 解析 build.gradle 的 buildType 配置 |
| `minifyEnabled` 是否为 true | 同上 |
| 硬编码 API Key | 正则扫描源码中的 key/token/password 模式 |
| 签名配置是否完整 | 检查 signingConfigs 是否包含 release 配置 |
| SDK 版本兼容性 | 对比 compileSdk / targetSdk 与当前推荐值 |
| 依赖库版本是否过旧 | 扫描 build.gradle 依赖，对比 Maven Central 最新版 |
| 资源冗余 | 检查未使用的 drawable / layout / string |
| 测试依赖是否泄漏 | 确认 testImplementation 未出现在 release 依赖中 |

关键点是**把这些检查做成自动化的**，而不是一个文档让人去勾选。每次构建 Release 包前自动运行，有问题直接阻断构建，比事后发现强太多。

## 痛点四：多渠道打包配置繁琐

做国内市场的 Android 应用，经常需要多渠道打包。小米、华为、OPPO、vivo、应用宝……每个渠道可能有不同的配置。

传统的做法是在 `build.gradle` 里写一堆 `productFlavors`：

```kotlin
productFlavors {
    create("xiaomi") { dimension = "channel" }
    create("huawei") { dimension = "channel" }
    create("oppo") { dimension = "channel" }
    // ... 还有十几个
}
```

然后每次加新渠道都要改 build.gradle，提交代码，重新构建。

### 更高效的方式

把渠道配置外置到 `version.properties` 或 `local.properties`，通过 Gradle 脚本动态读取：

```kotlin
// build.gradle.kts
val channelsFile = file("channels.properties")
if (channelsFile.exists()) {
    val props = Properties().apply { load(channelsFile.inputStream()) }
    props.stringPropertyNames().forEach { channel ->
        productFlavors.create(channel) {
            dimension = "channel"
            manifestPlaceholders["CHANNEL"] = channel
        }
    }
}
```

这样加渠道只需要改配置文件，不用动构建脚本。

## 痛点五：CI/CD 配置从零开始写

每次新建项目都要写一遍 GitHub Actions 或 GitLab CI 的配置。格式容易写错，变量名容易拼错，签名配置经常出问题。

我的做法是做一个**配置生成器**，根据项目的实际配置（compileSdk 版本、JDK 版本、是否有 productFlavors、签名方式）自动生成 CI 配置：

```yaml
# 自动生成的 GitHub Actions 配置示例
name: Build and Release
on:
  push:
    tags: ['v*']

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
      - name: Build AAB
        run: ./gradlew bundleRelease
      - name: Sign
        uses: r0adkll/sign-android-release@v1
        with:
          releaseDirectory: app/build/outputs/bundle/release
          signingKeyBase64: ${{ secrets.SIGNING_KEY }}
          alias: ${{ secrets.ALIAS }}
          keyStorePassword: ${{ secrets.KEY_STORE_PASSWORD }}
```

生成器会检测项目实际使用的 Gradle Wrapper 版本、JDK 版本、AGP 版本，确保生成的配置能直接跑。

## 整合：从散装工具到一体化工作流

上面这些问题，每一个都有独立的解决方案。但真正提升效率的，是把它们**串联成一个完整的工作流**：

1. **项目初始化** → 一键配置渠道、SDK、签名、混淆规则、CI/CD
2. **日常开发** → 自动管理 Bundletool、依赖健康检查、构建性能分析
3. **发版前** → 13 项自动检查，有问题直接阻断
4. **发版后** → 包体积追踪、版本对比、资源冗余扫描

这就是我开发 ADB Pro 插件的初衷——把散落在各处的命令行工具、Gradle 脚本、手动检查项，整合到 Android Studio 的一个工具窗口里。开发过程中最花时间的不是写 UI，而是处理各种边界情况：离线时 Bundletool 下载失败怎么降级、非标准模块名怎么动态检测、HTTP 连接泄漏怎么避免。

如果你也在 Android 发版流程上有类似的痛点，可以在 JetBrains Marketplace 搜 "ADB Pro" 看看，有 30 天免费试用。当然，上面分享的思路和代码片段本身就可以直接用，不依赖任何特定工具。

## 一些额外的心得

**关于 ProGuard 混淆字典：** 默认的 a-z 混淆太容易被反编译工具还原。使用 Unicode 形似字符（比如拉丁扩展、西里尔字母、希腊字母）作为混淆字典，能大幅增加逆向难度。我整理了 11 套混淆字典，放在了 [codetroupe.github.io/dictionaries](https://codetroupe.github.io/dictionaries/) 上，可以直接下载使用。

**关于资源混淆：** AabResGuard 可以对 AAB 中的资源名进行混淆，减小包体积的同时增加逆向难度。但它对 `whitelist` 的配置要求很严格，配置不当会导致资源引用失败。

**关于构建性能：** 如果你的项目 clean build 超过 3 分钟，先检查 `org.gradle.parallel` 和 `org.gradle.caching` 是否开启。这两个配置项的投入产出比最高。

---

希望这些经验对你有帮助。Android 发版不应该是一场赌博，而应该是一条可重复、可验证的流水线。
