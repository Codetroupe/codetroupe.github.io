# Android 混淆字典完全指南：R8 时代还能用吗？11 套字典实测对比

开启 ProGuard/R8 混淆后，你的类名、方法名、字段名会被重命名为 `a`、`b`、`c` 这样的短名称。但这套默认命名方案有两个问题：一是太规律，逆向工具一眼就能识别这是混淆后的代码；二是所有项目的混淆结果都长一样，没有任何个性化。

**混淆字典**（Obfuscation Dictionary）就是用来解决这个问题的——你可以指定一组自定义字符来替代默认的 `a-z`，让混淆后的名称变成视觉上难以辨认的 Unicode 字符、Java 关键字、甚至跨编码乱码。

但有一个很多人忽略的问题：**从 AGP 3.4 起，Android 默认的混淆器已经从 ProGuard 切换到了 R8。那 `-obfuscationdictionary` 这个 ProGuard 时代的配置，R8 还支持吗？**

这篇文章会从 R8 兼容性、字典配置方法、11 套字典策略对比、验证流程这几个角度，把混淆字典这件事讲透。

## 一、R8 还支持混淆字典吗？

先给结论：**支持。**

R8 在设计上兼容 ProGuard 的规则文件（`proguard-rules.pro`），包括混淆字典相关的三个配置项。R8 源码中有专门的 `DictionaryReader` 类（位于 `com.android.tools.r8.naming` 包），负责解析字典文件并应用到命名流程中。

在 R8 Full Mode（AGP 8.0+ 默认开启）的不兼容特性列表中，列出的不支持项主要是 `-whyareyoukeeping`、枚举合并、类合并、参数移除等优化相关功能。混淆字典属于**命名**（naming）阶段，不在不兼容列表内。

简单说：ProGuard 时代的混淆字典配置，在 R8 下可以原样使用，不需要做任何改动。

## 二、三个字典配置项

ProGuard/R8 提供了三个独立的字典配置，分别控制不同层级的命名：

```proguard
# 字段名 + 方法名混淆字典
-obfuscationdictionary proguard-dic-homoglyph.txt

# 类名混淆字典
-classobfuscationdictionary proguard-dic-homoglyph.txt

# 包名混淆字典
-packageobfuscationdictionary proguard-dic-homoglyph.txt
```

三个配置可以指向同一个字典文件，也可以分别使用不同的字典。

**字典文件格式**：纯文本，每行一个词。以 `#` 开头的行为注释，会被忽略。空白行和重复项也会被自动过滤。字典中的字符必须是合法的 Java 标识符起始字符（通过 `Character.isJavaIdentifierStart()` 校验），否则 R8 会跳过该条目。

**字典耗尽机制**：如果字典中的字符用完了（比如字典只有 10 个字符，但项目有 100 个类需要命名），R8 会用字典字符做组合（类似 `aa`、`ab`、`ac`...）。如果组合也耗尽了，会回退到默认的 `a-z` 命名。所以字典的字符数量直接决定了混淆效果的覆盖范围。

## 三、字典策略对比

我整理了 11 套混淆字典，按策略分为四类。下面是完整对比：

### 3.1 形似字符类（Homoglyph）

核心思路是用不同 Unicode 区段中**视觉上相似**的字符来替代 ASCII 字母。比如希腊字母的 `α`（U+03B1）和拉丁字母 `a` 在很多字体中几乎一样，西里尔字母的 `а`（U+0430）也是。

逆向人员用 jadx 打开后看到的方法名可能是 `аbс`——看起来像 `abc`，但实际是三个来自不同语系的字符。搜索、复制粘贴、代码分析工具全部失效。

| 字典 | 字符数 | 3 字符组合数 | 说明 |
|------|--------|-------------|------|
| **Homoglyph** | 255 | 16,581,375 | 跨语系视觉形似字符，覆盖面最广 |
| **Minimal Confusable** | 52 | 140,608 | 每个 ASCII 字母取一个最佳替代，轻量方案 |

`Homoglyph` 是我最常用的，字符集适中，组合空间大，反编译后的视觉混淆效果最好。`Minimal Confusable` 适合不想太激进的场景，只做最小替换。

### 3.2 特定语系类

使用某个完整语系的字符集。逆向人员即使知道用了哪个语系，面对满屏不认识的字符也很难手动分析。

| 字典 | 字符数 | 3 字符组合数 | 说明 |
|------|--------|-------------|------|
| **Greek** | 122 | 1,815,848 | 希腊字母及扩展形式 |
| **Cyrillic** | 296 | 25,934,336 | 西里尔字母（俄语等使用） |
| **Latin Extended** | 494 | 120,553,784 | 拉丁扩展，含变音符号、IPA |
| **Hebrew + Arabic** | 423 | 75,686,967 | 希伯来语 + 阿拉伯语，含从右到左书写方向 |
| **East Asian** | 246 | 14,886,936 | CJK 部首、片假名、平假名 |
| **Indigenous Scripts** | 1,146 | 1,505,060,136 | 切罗基、格鲁吉亚、亚美尼亚、泰语、老挝语等 |

`Hebrew + Arabic` 有个额外效果：这些语系是从右到左书写的，在部分 IDE 和反编译工具中会导致光标移动和文本选择异常，进一步增加逆向难度。

`Indigenous Scripts` 的字符数最多（1,146），3 字符组合超过 15 亿，适用于超大项目。

### 3.3 编码干扰类

| 字典 | 字符数 | 3 字符组合数 | 说明 |
|------|--------|-------------|------|
| **Encoding Chaos** | 575 | 190,109,375 | UTF-8 字节在 GBK/Big5/Shift-JIS 下解码为完全不同的字符 |

这套字典的思路比较独特：选取的字符在 UTF-8 编码下是合法的，但如果逆向人员的工具或终端用 GBK、Big5、Shift-JIS 等编码打开，会看到完全不同的乱码。这在中文开发环境中尤其有效，因为很多工具的默认编码不是 UTF-8。

### 3.4 全量合并类

| 字典 | 字符数 | 3 字符组合数 | 说明 |
|------|--------|-------------|------|
| **Ultimate** | 3,056 | 28,540,399,616 | 所有语系合并，最大字符集 |

如果不确定选哪个，直接用 `Ultimate`。3,056 个字符，3 字符组合超过 285 亿，覆盖任何规模的项目。

## 四、实际配置

在 Android 项目中使用混淆字典只需要两步。

### 4.1 放置字典文件

把下载的字典文件（`.txt`）放到项目根目录或 `proguard-rules.pro` 同级目录下：

```
app/
├── proguard-rules.pro
├── proguard-dic-homoglyph.txt   ← 字典文件
└── build.gradle.kts
```

### 4.2 在 ProGuard 规则中引用

在 `proguard-rules.pro` 中添加：

```proguard
# 混淆字典配置（R8 兼容）
-obfuscationdictionary proguard-dic-homoglyph.txt
-classobfuscationdictionary proguard-dic-homoglyph.txt
-packageobfuscationdictionary proguard-dic-homoglyph.txt
```

这三行就够了。R8 在构建时会自动读取字典文件并应用到命名流程。

### 4.3 推荐的字典组合

根据项目需求选择：

- **通用推荐**：`Homoglyph` — 视觉混淆效果最好，字符集大小适中
- **最大混淆**：`Ultimate` — 3,056 字符，适合大型项目
- **轻量方案**：`Minimal Confusable` — 52 字符，对 APK 体积影响最小
- **编码干扰**：`Encoding Chaos` — 适合面向中文用户的应用，利用 GBK 编码差异

这 11 套字典都可以在 [codetroupe.github.io/dictionaries](https://codetroupe.github.io/dictionaries/) 免费下载，所有字符都经过 `Character.isJavaIdentifierStart()` 校验，可以直接使用。

## 五、验证字典是否生效

配置完字典后，需要验证它是否真的生效了。三个步骤：

### 5.1 检查 mapping.txt

构建完成后，查看 `app/build/outputs/mapping/release/mapping.txt`。如果字典生效，你会看到类似这样的映射：

```
com.example.MyClass -> αβγ.αβ:
    void myMethod() -> αα(αβγ)
```

如果还是 `a.b.c` 这种默认命名，说明字典没有被正确加载，检查文件路径是否正确。

### 5.2 反编译验证

用 jadx 打开混淆后的 APK/AAB，直接看类名和方法名。好的字典会让反编译结果变成这样：

```java
// 使用 Homoglyph 字典后的效果
public class αβγ {
    public static void аbс(аβγ var0) {
        // 方法名看起来像 abc 但实际是希腊+西里尔字符
    }
}
```

对比默认混淆：

```java
// 默认混淆效果
public class a {
    public static void a(a var0) {
        // 规律的 a, b, c 命名
    }
}
```

### 5.3 字典耗尽检查

如果项目很大（数千个类），检查 `mapping.txt` 的尾部，看是否出现了回退到默认 `a-z` 命名的情况。如果出现了，说明字典的字符组合空间不够，需要换用字符数更多的字典（比如从 `Minimal Confusable` 换到 `Homoglyph` 或 `Ultimate`）。

## 六、对 APK 体积的影响

使用 Unicode 字符替代 ASCII 会增加 DEX 文件中的字符串池大小，因为 UTF-8 编码下一个中文字符占 3 字节，而 ASCII 字符只占 1 字节。

但实际影响很小。以一个中等规模项目为例：

| 方案 | DEX 字符串池增量 | 占 APK 比例 |
|------|-----------------|------------|
| 默认 a-z | 基准 | - |
| Homoglyph（255 字符） | +2~4 KB | < 0.1% |
| Ultimate（3,056 字符） | +8~15 KB | < 0.2% |
| Encoding Chaos（575 字符） | +4~8 KB | < 0.1% |

对于现代 Android 应用（通常 20-50 MB），这点增量完全可以忽略。R8 的 `minifyEnabled` 本身就会做大量优化来缩减 DEX 体积，字典带来的几 KB 增量不构成问题。

## 七、混淆字典的局限性

需要诚实说明的一点：**混淆字典不会从根本上提升代码安全性。**

Guardsquare（ProGuard 的开发商）在官方文档中也提到，混淆字典"hardly improves the obfuscation"——它只是增加反编译后代码的**可读性难度**，而不是阻止反编译本身。有经验的逆向工程师仍然可以通过以下方式绕过：

- 查看 `mapping.txt`（如果你没有保护好这个文件）
- 用 JADX 的"Deobfuscate"功能自动还原
- 通过字符串常量、API 调用模式等上下文信息推断功能

混淆字典的真正价值在于**提高逆向的时间成本**。对于大部分脚本小子和初级逆向人员来说，满屏的 Unicode 形似字符足以让他们放弃。而对于专业逆向人员，你需要配合 R8 Full Mode 的激进优化、字符串加密、反调试等手段来构建多层防护。

## 八、常见问题

**Q：R8 Full Mode 下字典配置会失效吗？**
不会。Full Mode 的不兼容列表中没有字典相关选项。R8 Full Mode + 混淆字典的组合在 AGP 8.x 下可以正常工作。

**Q：字典文件的路径怎么写？**
相对于 `proguard-rules.pro` 文件的路径。如果字典文件和规则文件在同一目录，直接写文件名即可。

**Q：三个字典配置必须用同一个文件吗？**
不必须。你可以给类名用一个字典，给方法名用另一个。但通常用同一个就够了。

**Q：字典字符会不会导致编译错误？**
不会。只要字符通过了 `Character.isJavaIdentifierStart()` 校验（上面提供的 11 套字典都已校验），就不会有编译问题。

**Q：混淆字典和 `-dontobfuscate` 冲突吗？**
冲突。`-dontobfuscate` 会禁用整个混淆步骤，字典配置自然也不会生效。确保你的 release 构建没有设置 `-dontobfuscate`。

**Q：debug 构建也会应用字典吗？**
取决于你的 ProGuard 配置是否在 debug buildType 中启用。通常 debug 不启用混淆，所以字典也不会生效。

## 九、写在最后

混淆字典是一个成本低、效果直观的混淆增强手段。三行配置、一个文本文件，就能让反编译结果从一目了然变成满屏天书。虽然它不能替代专业的代码保护方案，但作为混淆链路上的一层加固，性价比很高。

如果你用的是 JetBrains IDE，[ADB Pro](https://plugins.jetbrains.com/plugin/32100-adb-pro) 插件的 R8 Assistant 内置了字典管理功能，可以直接在 IDE 中预览、下载和应用这 11 套字典，不需要手动管理文件。更多关于混淆字典和 R8 配置的内容，也可以参考 [ADB Pro 文档](https://codetroupe.github.io/dictionaries/)。
