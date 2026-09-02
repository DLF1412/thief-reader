# thief-reader - Claude 助手指南

## 项目概述

这是一个 VSCode 阅读插件，允许用户在状态栏中隐蔽地阅读 PDF、TXT、EPUB 文件以及粘贴的文本内容。

## 交互语言说明

**请务必使用中文与用户交互**

## 架构理解

### 核心文件结构

```
thief-reader/
├── extension.js              # 扩展入口文件（精简版）
├── package.json              # 插件配置
├── main-icon.png             # 侧边栏图标
├── README.md                 # 使用文档
├── CHANGELOG.md              # 更新日志
└── src/                      # 源代码目录
    ├── managers/             # 状态管理类
    │   ├── AltKeyManager.js      # Alt键状态管理器
    │   └── StorageManager.js     # 存储管理器
    ├── handlers/             # 事件处理器
    │   ├── ScrollWheelHandler.js # 滚轮滚动处理器
    │   └── MouseEventListener.js # 鼠标事件监听器
    ├── windows/              # 窗口管理器
    │   └── FloatingWindowManager.js # 悬浮窗管理器
    ├── providers/            # 主提供者
    │   └── ThiefReaderWebviewProvider.js # WebView提供者
    ├── parsers/              # 文件解析器
    │   ├── BaseParser.js         # 基础解析器接口
    │   ├── PdfParser.js          # PDF文件解析器
    │   ├── TxtParser.js          # TXT文件解析器
    │   ├── EpubParser.js         # EPUB文件解析器
    │   └── index.js              # 解析器工厂
    ├── templates/            # HTML模板
    │   ├── main-view.html        # 主界面模板
    │   └── index.js              # 模板渲染器
    ├── utils/                # 工具函数
    │   ├── contentUtils.js       # 内容处理辅助函数
    │   └── htmlTemplates.js      # HTML模板生成
    └── index.js              # 统一导出入口
```

### 主要类结构

1. **`AltKeyManager`** - 管理 Alt 键状态
2. **`ScrollWheelHandler`** - 处理滚动事件
3. **`FloatingWindowManager`** - 管理章节预览弹窗
4. **`ThiefReaderWebviewProvider`** - 主要提供者类，管理整体功能
5. **`StorageManager`** - 存储管理器，处理数据持久化
6. **`MouseEventListener`** - 鼠标事件监听器
7. **`BaseParser`** - 基础解析器接口
8. **`PdfParser`** - PDF文件解析器
9. **`TxtParser`** - TXT文件解析器
10. **`EpubParser`** - EPUB文件解析器
11. **`ParserFactory`** - 解析器工厂
12. **`TemplateRenderer`** - 模板渲染器

## 核心功能

### 文件支持
- PDF 文件解析和阅读
- TXT 纯文本文件阅读
- EPUB 电子书阅读
- 剪贴板文本内容阅读

### 阅读特性
- 状态栏显示阅读内容
- 章节预览弹窗
- 位置记忆功能
- 多文件管理
- 透明度调节

### 快捷操作
- `Alt + 左/右方向键`：逐字滑动（10字符）
- `Alt + Shift + 左/右`：快速翻页（80字符）
- `Shift + 空格`：显示/隐藏内容

## 技术依赖

- `pdf-parse` - PDF 文件解析
- `epub2` - EPUB 文件解析
- VSCode Extension API - 插件框架

## 模块职责

| 模块 | 职责 | 说明 |
|------|------|------|
| **managers/** | 状态管理 | 管理Alt键状态和数据持久化 |
| **handlers/** | 事件处理 | 处理滚轮、鼠标等用户交互事件 |
| **windows/** | 窗口管理 | 管理章节预览弹窗的显示和隐藏 |
| **providers/** | 核心逻辑 | WebView提供者，协调所有模块工作 |
| **parsers/** | 文件解析 | 支持PDF/TXT/EPUB格式解析 |
| **templates/** | 界面模板 | HTML模板和渲染器 |
| **utils/** | 工具函数 | 通用的辅助函数 |

## 开发注意事项

1. **仅支持纯文本内容**，不支持图片显示
2. 所有数据使用 VSCode 的全局存储进行持久化
3. 文件状态会实时检测（正常/缺失/错误）
4. 支持重复文件检测和重新加载

## 调试和测试

项目配置了完整的调试环境：
- `.vscode/launch.json` - 调试配置
- `jsconfig.json` - JavaScript 项目配置
- `eslint.config.mjs` - 代码规范配置

## 当前状态

版本：0.0.10，积极开发中，最近完成了重大架构重构：
- 将单一的 `extension.js` 文件拆分为模块化的目录结构
- 实现了文件解析器的解耦（支持PDF/TXT/EPUB）
- 将HTML模板外置到单独的模板文件
- 代码可维护性和可扩展性大幅提升

## Claude 助手使用指南

在与用户交互时，请：

1. **始终使用中文回复**
2. 参考本文档和 README.md 了解功能细节
3. 在修改代码前先阅读相关文件
4. 优先使用 TodoWrite 工具规划任务
5. 保持代码简洁，避免过度工程化
6. 遵循项目现有的代码风格

## 常见问题解决

- PDF 图片不显示：这是正常行为，仅提取文本内容
- 复杂排版混乱：PDF 复杂排版可能导致文本顺序问题
- 大文件加载慢：超过 10MB 的文件可能需要更长时间

请根据用户需求，使用中文提供相应的技术支持和功能改进。