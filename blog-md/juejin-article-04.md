# Android AAB 本地测试完整指南：为什么不能直接安装？bundletool、APKS、签名和常见坑

现在做 Android 发版，AAB 已经是绕不开的格式。Google Play 推荐甚至强制使用 Android App Bundle，很多团队的 CI 产物也从 `apk` 变成了 `aab`。

但 AAB 有一个很容易让人困惑的地方：**它不是一个可以直接安装到手机上的文件**。

你双击不行，`adb install app-release.aab` 不行，拖进模拟器也不行。真正能安装到设备上的，仍然是 APK，或者一组 split APK。而 AAB 的作用，是作为“发布包”，交给 Google Play 或 bundletool 根据设备配置生成对应的 APK 组合。

这篇文章把 AAB 本地测试这条链路完整梳理一下：

- AAB 和 APK / APKS 到底是什么关系
- 为什么 AAB 不能直接安装
- 如何用 bundletool 把 AAB 转成 APKS
- 签名配置为什么经常出问题
- 多设备、签名冲突、版本降级这些坑怎么排查
- 如何把这套流程做成更稳定的工具化流程

本文主要面向日常 Android 开发和发版测试，不讨论 Google Play 后台动态分发的全部细节。

## 一、AAB、APK、APKS 分别是什么

先把几个概念说清楚。

### APK

APK 是 Android 设备可以直接安装的应用包。

传统流程里，我们构建出来的是：

```bash
app-release.apk
```

然后直接：

```bash
adb install app-release.apk
```

设备拿到这个 APK，就能完成安装。

### AAB

AAB，全称 Android App Bundle，是发布格式，不是安装格式。

它里面包含：

- base module
- dynamic feature module
- resources
- manifest
- dex
- native libraries
- metadata

AAB 本身更像一个“原材料包”。Google Play 会根据用户设备的 ABI、屏幕密度、语言、SDK 版本等信息，从 AAB 中生成适合该设备的一组 APK。

所以你不能直接：

```bash
adb install app-release.aab
```

因为设备并不知道怎么从 AAB 中拆出自己需要的 split APK。

### APKS

APKS 是 bundletool 生成的归档文件，本质上是一个 zip，里面包含一组 APK 和元数据。

常见生成方式：

```bash
java -jar bundletool.jar build-apks \
  --bundle=app-release.aab \
  --output=app-release.apks
```

然后安装：

```bash
java -jar bundletool.jar install-apks \
  --apks=app-release.apks
```

可以理解为：

```text
AAB  --bundletool-->  APKS  --bundletool install-->  device
```

## 二、为什么 AAB 不能直接安装

核心原因是：**AAB 不对应某一台具体设备。**

一个 Android 设备安装应用时，需要的是明确的 APK 文件。而 AAB 里可能包含多套资源和代码：

- `arm64-v8a`
- `armeabi-v7a`
- `x86_64`
- `hdpi`
- `xxhdpi`
- `zh`
- `en`
- dynamic feature modules

Google Play 分发时，会根据设备信息选择最小集合。例如一台 arm64、中文、xxhdpi 的设备，可能只需要其中一部分 split APK。

这也是 AAB 的价值：减少用户下载体积。

但本地测试时，就必须有人来扮演 Google Play 的角色，这个角色就是 bundletool。

## 三、最基本的 bundletool 流程

假设你已经有一个 release AAB：

```text
app/build/outputs/bundle/release/app-release.aab
```

最基础的转换命令是：

```bash
java -jar bundletool-all.jar build-apks \
  --bundle=app/build/outputs/bundle/release/app-release.aab \
  --output=app-release.apks
```

如果只是 debug 测试，这样可能能跑。但 release-like 测试通常还需要签名。

完整一点的命令：

```bash
java -jar bundletool-all.jar build-apks \
  --bundle=app-release.aab \
  --output=app-release.apks \
  --ks=release.jks \
  --ks-key-alias=release \
  --ks-pass=pass:your_store_password \
  --key-pass=pass:your_key_password
```

安装：

```bash
java -jar bundletool-all.jar install-apks \
  --apks=app-release.apks
```

如果连接了多台设备，需要指定设备：

```bash
java -jar bundletool-all.jar install-apks \
  --apks=app-release.apks \
  --device-id=emulator-5554
```

看起来不复杂，但实际项目里会遇到很多细节问题。

## 四、签名为什么经常出问题

AAB 转 APKS 时，签名非常关键。

如果你没有传 keystore，或者签名和设备上已有应用不一致，就很容易出现这些问题：

```text
INSTALL_FAILED_UPDATE_INCOMPATIBLE
INSTALL_PARSE_FAILED_NO_CERTIFICATES
INSTALL_FAILED_VERSION_DOWNGRADE
```

### 1. 签名和旧版本不一致

最常见的是设备上已经装了一个旧版本，它使用的是另一套签名。

例如：

- 旧版本：debug keystore
- 新版本：release keystore

这时直接安装会失败：

```text
INSTALL_FAILED_UPDATE_INCOMPATIBLE
```

解决方式：

```bash
adb uninstall your.package.name
```

或者确认当前测试包和旧包使用同一套签名。

如果只是开发机测试，可以先卸载旧包。但如果是升级兼容性测试，就不能卸载，必须保证签名一致。

### 2. release-like 测试不要偷懒用 debug 签名

很多问题只会在 release 签名、release buildType、R8 开启后出现。

如果你用 debug 签名测试 AAB，可能会漏掉：

- keystore 配置错误
- release manifest 差异
- minifyEnabled 后的运行时问题
- 第三方 SDK 的 release-only 行为
- Google Play App Signing 相关差异

本地测试不一定每次都用正式生产 keystore，但至少要明确当前测试目的：

| 测试目标 | 推荐签名 |
|---|---|
| 快速功能验证 | debug 或测试 keystore |
| 发版前验收 | release-like keystore |
| 升级兼容性测试 | 必须和线上版本签名一致 |
| 商店提审前验证 | 尽量贴近真实 release 配置 |

### 3. 不要把密码长期写在脚本里

bundletool 命令支持：

```bash
--ks-pass=pass:xxx
--key-pass=pass:xxx
```

这很方便，但也很危险。脚本一旦提交到仓库，密码就泄漏了。

更稳妥的方式：

- 从环境变量读取
- 使用本机安全存储
- CI 中使用 secret
- IDE 插件中使用 PasswordSafe
- 本地临时输入，不落盘

## 五、APKS 有几种生成模式

bundletool 的 `build-apks` 支持不同模式。

### universal

生成一个通用 APK，适合快速测试：

```bash
java -jar bundletool-all.jar build-apks \
  --bundle=app-release.aab \
  --output=app-universal.apks \
  --mode=universal
```

优点是简单，生成的 APKS 里通常包含一个 universal APK。

缺点是不能完全模拟 Google Play 的 split 分发结果，包体也更大。

### connected-device

根据当前连接设备生成适配该设备的 APK：

```bash
java -jar bundletool-all.jar build-apks \
  --bundle=app-release.aab \
  --output=app-device.apks \
  --connected-device
```

这种更贴近真实安装结果，但依赖当前连接设备。

### device-spec

先导出设备配置：

```bash
java -jar bundletool-all.jar get-device-spec \
  --output=device-spec.json
```

再根据设备配置生成：

```bash
java -jar bundletool-all.jar build-apks \
  --bundle=app-release.aab \
  --output=app-device.apks \
  --device-spec=device-spec.json
```

适合 CI 或固定设备矩阵测试。

## 六、常见错误排查

### 1. 找不到设备

先看：

```bash
adb devices
```

如果设备状态是：

```text
unauthorized
```

说明手机上还没有授权 USB 调试。

如果有多台设备：

```text
emulator-5554 device
R5CNxxxxxx device
```

安装时就要指定：

```bash
--device-id=R5CNxxxxxx
```

否则 bundletool 可能不知道安装到哪台设备。

### 2. 版本号降级

错误：

```text
INSTALL_FAILED_VERSION_DOWNGRADE
```

说明设备上已有版本的 `versionCode` 更高。

解决方式：

- 卸载旧版本
- 提高当前包的 `versionCode`
- 如果只是调试，可以用 `adb install -d`，但 bundletool 流程里不建议长期依赖这个

发版测试最好不要绕过版本号，因为真实用户升级也会受这个规则约束。

### 3. split APK 不完整

如果你手动从 APKS 中解压 APK，然后自己 `adb install-multiple`，很容易漏掉某个 split。

APKS 里通常不是一个 APK，而是一组 APK：

```text
base-master.apk
base-arm64_v8a.apk
base-xxhdpi.apk
base-zh.apk
```

少装一个，可能就会：

- 启动崩溃
- 资源找不到
- native so 缺失
- 动态功能模块异常

所以一般建议使用：

```bash
bundletool install-apks
```

而不是自己拆 APKS 手动安装。

### 4. bundletool 版本过旧

Android Gradle Plugin、App Bundle 格式、Play Feature Delivery 都会变化。

如果 bundletool 版本太旧，可能出现奇怪的解析错误。

建议：

- 固定团队使用的 bundletool 版本
- CI 和本地保持一致
- 定期升级但不要每个人随意升级
- 出现无法解析 AAB 时先检查 bundletool 版本

### 5. R8 后才出现运行时崩溃

AAB 本地安装流程本身没问题，但 release build 打开了：

```kotlin
isMinifyEnabled = true
isShrinkResources = true
```

这时可能出现：

- 反射找不到类
- Gson/Moshi 序列化字段异常
- Retrofit 接口注解丢失
- Hilt/Dagger 生成类被裁剪
- WebView JS Bridge 方法被混淆
- Firebase / Ads SDK 资源或 metadata 异常

所以 AAB 本地测试不应该只看“能不能安装”，还要跑关键业务路径。

建议至少验证：

- 启动
- 登录
- 网络请求
- JSON 解析
- 支付/订阅
- 推送
- Deep Link
- 崩溃上报
- 统计埋点
- WebView 或动态加载逻辑

## 七、CI 产物怎么接入本地测试

很多团队现在不是本地构建 AAB，而是 CI 构建后上传到：

- GitHub Releases
- GitLab Releases
- Jenkins artifacts
- 私有制品库

这时测试人员通常要：

1. 打开浏览器
2. 找到对应 release
3. 下载 `.aab`
4. 找 bundletool
5. 配签名
6. 转 APKS
7. 安装到设备

这条链路很长，也很容易拿错包。

更好的方式是让 CI 产物具备清晰命名：

```text
myapp-googleplay-release-v1.8.0-180.aab
myapp-samsung-release-v1.8.0-180.aab
myapp-internal-staging-v1.8.0-180.aab
```

并保留必要信息：

- versionName
- versionCode
- buildType
- flavor/channel
- commit sha
- mapping.txt
- changelog

如果工具能直接扫描远程 release assets，就可以少很多人工下载和复制路径的步骤。

## 八、一个更稳定的本地 AAB 测试流程

我现在比较推荐这样的流程：

1. CI 或本地生成 AAB
2. 确认 AAB 文件名包含版本、渠道、构建类型
3. 选择和测试目的匹配的签名配置
4. 用固定版本 bundletool 转成 APKS
5. 指定设备安装
6. 跑关键业务路径
7. 保存安装日志和失败原因
8. 如果是 release 验收，同步保存 mapping.txt

对应到工具层面，最好把这些东西都显式化：

- 当前选择的是哪个 AAB
- 使用的是哪个 signing config
- bundletool 路径和版本
- 输出的 APKS 在哪里
- 安装到哪台设备
- 命令执行日志是什么
- 失败时的原始错误是什么

这样排查问题时，不会只剩一句“安装失败了”。

## 九、我最后怎么处理这条链路

最开始我也是手写命令，后来发现每个项目、每台设备、每个 keystore 都会让这套流程变复杂。

所以我把这条链路拆成几个固定模块：

- AAB 文件扫描
- bundletool 自动管理
- Gradle signingConfigs 读取
- APKS 转换
- 设备选择
- 安装日志
- GitHub / GitLab release assets 扫描

如果只需要这条轻量链路，我把它做成了一个免费的 JetBrains 插件：**AAB Tools**。它主要解决 AAB 转 APKS 和安装到设备这件事。

如果还需要更完整的发版流程，比如：

- Release Readiness 检查
- Signing Tools
- Bundle Inspector
- R8 / ProGuard 规则
- 资源混淆
- CI/CD 生成
- 依赖健康检查

那就更适合放到完整的 ADB Pro 工作流里。

这里不展开产品细节，重点还是这篇文章的结论：**AAB 本地测试不是一个 adb install 命令能解决的问题，它本质上是一条“构建产物 + bundletool + 签名 + 设备配置 + 运行时验证”的链路。**

把这条链路标准化之后，AAB 测试会稳定很多，发版前也少很多临时排查。

## 十、总结

AAB 本地测试最容易踩坑的地方，不在命令本身，而在命令背后的上下文：

- AAB 不是安装包，不能直接 `adb install`
- APKS 是 bundletool 根据 AAB 生成的安装归档
- 签名必须和测试目标匹配
- 多设备时要明确 device-id
- universal 模式方便，但不等于真实 split 分发
- release-like 测试必须关注 R8、资源、SDK、业务路径
- CI 产物要和版本、渠道、mapping 文件绑定

如果你现在还在手动敲 bundletool 命令，建议至少把命令、签名、设备选择和日志记录标准化。等这条链路稳定之后，再去做更完整的发版自动化，会轻松很多。
