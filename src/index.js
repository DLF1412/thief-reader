/**
 * thief-reader 模块入口
 * 导出所有公共模块
 */

// 管理器
const AltKeyManager = require('./managers/AltKeyManager');
const StorageManager = require('./managers/StorageManager');

// 处理器
const ScrollWheelHandler = require('./handlers/ScrollWheelHandler');
const MouseEventListener = require('./handlers/MouseEventListener');

// 窗口管理器
const FloatingWindowManager = require('./windows/FloatingWindowManager');

// 提供者
const ThiefReaderWebviewProvider = require('./providers/ThiefReaderWebviewProvider');

// 解析器
const { parserFactory, BaseParser, PdfParser, TxtParser, EpubParser } = require('./parsers');

// 模板
const { templateRenderer } = require('./templates');

// 工具函数
const { getChapterContentAsString } = require('./utils/contentUtils');
const { generateChapterPreviewHtml } = require('./utils/htmlTemplates');

module.exports = {
	// 管理器
	AltKeyManager,
	StorageManager,

	// 处理器
	ScrollWheelHandler,
	MouseEventListener,

	// 窗口管理器
	FloatingWindowManager,

	// 提供者
	ThiefReaderWebviewProvider,

	// 解析器
	parserFactory,
	BaseParser,
	PdfParser,
	TxtParser,
	EpubParser,

	// 模板
	templateRenderer,

	// 工具函数
	getChapterContentAsString,
	generateChapterPreviewHtml
};
